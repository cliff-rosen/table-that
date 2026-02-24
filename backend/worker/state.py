"""
Worker State - Shared state for the worker process

Separate module to avoid circular imports between main.py and api.py.
"""

import asyncio
from typing import Optional


class WorkerState:
    """Global worker state"""
    def __init__(self):
        self.running = False
        self.scheduler_task: Optional[asyncio.Task] = None
        self.active_jobs: dict = {}
        # Event to wake up scheduler immediately when a job is triggered
        self.wake_event: asyncio.Event = asyncio.Event()

    def wake_scheduler(self):
        """Signal the scheduler to wake up immediately"""
        self.wake_event.set()


# Singleton instance
worker_state = WorkerState()
