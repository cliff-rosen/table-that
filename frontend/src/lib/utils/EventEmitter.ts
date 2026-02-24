/**
 * A simple EventEmitter implementation for browser environments
 * This replaces the Node.js events.EventEmitter which is not available in the browser
 */
export class EventEmitter {
    private events: Record<string, Array<(...args: any[]) => void>> = {};

    /**
     * Register an event listener
     * @param event The event name
     * @param listener The callback function
     */
    on(event: string, listener: (...args: any[]) => void): this {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
        return this;
    }

    /**
     * Remove an event listener
     * @param event The event name
     * @param listener The callback function to remove
     */
    removeListener(event: string, listener: (...args: any[]) => void): this {
        if (this.events[event]) {
            this.events[event] = this.events[event].filter(l => l !== listener);
        }
        return this;
    }

    /**
     * Alias for removeListener
     */
    off(event: string, listener: (...args: any[]) => void): this {
        return this.removeListener(event, listener);
    }

    /**
     * Emit an event
     * @param event The event name
     * @param args Arguments to pass to listeners
     */
    emit(event: string, ...args: any[]): boolean {
        if (this.events[event]) {
            this.events[event].forEach(listener => {
                listener(...args);
            });
            return true;
        }
        return false;
    }

    /**
     * Register a one-time event listener
     * @param event The event name
     * @param listener The callback function
     */
    once(event: string, listener: (...args: any[]) => void): this {
        const onceWrapper = (...args: any[]) => {
            listener(...args);
            this.removeListener(event, onceWrapper);
        };
        return this.on(event, onceWrapper);
    }

    /**
     * Remove all listeners for an event
     * @param event The event name (optional, if not provided removes all listeners)
     */
    removeAllListeners(event?: string): this {
        if (event) {
            this.events[event] = [];
        } else {
            this.events = {};
        }
        return this;
    }
} 