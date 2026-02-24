"""
Status Broker

Pub/sub mechanism for job status updates.
Allows management API clients to subscribe to real-time status streams.

Includes message buffering to handle race conditions where the job starts
publishing before clients subscribe.
"""

import asyncio
import logging
from typing import Dict, Set, List
from collections import deque
from dataclasses import dataclass, asdict
from datetime import datetime

logger = logging.getLogger('worker.status_broker')

# Buffer size for replaying messages to late subscribers
MESSAGE_BUFFER_SIZE = 50


@dataclass
class StatusUpdate:
    """A status update from a running job"""
    execution_id: str
    stage: str
    message: str
    timestamp: str = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow().isoformat()

    def to_dict(self) -> dict:
        return asdict(self)


class StatusBroker:
    """
    Manages subscriptions to job status updates.

    Publishers call: broker.publish(execution_id, status)
    Subscribers call: async for status in broker.subscribe(execution_id)

    Buffers recent messages per execution so late subscribers can catch up.
    """

    def __init__(self):
        # execution_id -> set of asyncio.Queue
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        # execution_id -> deque of recent StatusUpdate (for replay to late subscribers)
        self._message_buffer: Dict[str, deque] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, execution_id: str) -> asyncio.Queue:
        """
        Subscribe to status updates for an execution.
        Returns a queue that will receive StatusUpdate objects.

        Replays any buffered messages to the new subscriber so they don't miss
        messages that were published before they subscribed.
        """
        queue = asyncio.Queue()

        async with self._lock:
            if execution_id not in self._subscribers:
                self._subscribers[execution_id] = set()
            self._subscribers[execution_id].add(queue)

            # Replay buffered messages to this new subscriber
            if execution_id in self._message_buffer:
                for update in self._message_buffer[execution_id]:
                    queue.put_nowait(update)
                logger.debug(f"Replayed {len(self._message_buffer[execution_id])} buffered messages to new subscriber")

        logger.debug(f"New subscriber for execution {execution_id}, total: {len(self._subscribers.get(execution_id, set()))}")
        return queue

    async def unsubscribe(self, execution_id: str, queue: asyncio.Queue):
        """Remove a subscription"""
        async with self._lock:
            if execution_id in self._subscribers:
                self._subscribers[execution_id].discard(queue)
                if not self._subscribers[execution_id]:
                    del self._subscribers[execution_id]

        logger.debug(f"Unsubscribed from execution {execution_id}")

    async def publish(self, execution_id: str, stage: str, message: str):
        """Publish a status update to all subscribers and buffer for late subscribers"""
        update = StatusUpdate(
            execution_id=execution_id,
            stage=stage,
            message=message
        )

        async with self._lock:
            # Buffer the message for late subscribers
            if execution_id not in self._message_buffer:
                self._message_buffer[execution_id] = deque(maxlen=MESSAGE_BUFFER_SIZE)
            self._message_buffer[execution_id].append(update)

            subscribers = self._subscribers.get(execution_id, set()).copy()

        for queue in subscribers:
            try:
                queue.put_nowait(update)
            except asyncio.QueueFull:
                logger.warning(f"Queue full for subscriber on {execution_id}, dropping message")

    async def publish_complete(self, execution_id: str, success: bool, error: str = None):
        """Publish completion status and clean up"""
        stage = "completed" if success else "failed"
        message = "Job completed successfully" if success else f"Job failed: {error}"

        await self.publish(execution_id, stage, message)

        # Send sentinel to signal end of stream
        async with self._lock:
            subscribers = self._subscribers.get(execution_id, set()).copy()

        for queue in subscribers:
            try:
                queue.put_nowait(None)  # Sentinel value
            except asyncio.QueueFull:
                pass

        # Clean up subscribers and buffer
        async with self._lock:
            if execution_id in self._subscribers:
                del self._subscribers[execution_id]
            if execution_id in self._message_buffer:
                del self._message_buffer[execution_id]

        logger.debug(f"Completed and cleaned up execution {execution_id}")


# Global broker instance
broker = StatusBroker()
