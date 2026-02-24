import React from 'react';

/**
 * STATUS LEVELS - Simple and Clear:
 * 
 * 1. MISSION STATUS (MissionStatus)
 *    - Overall mission state: AWAITING_APPROVAL → IN_PROGRESS → COMPLETED/FAILED/CANCELLED
 *    - Shown as: "Mission: IN_PROGRESS"
 * 
 * 2. HOP STATUS (HopStatus)
 *    - Hop lifecycle state: HOP_PLAN_STARTED → HOP_PLAN_PROPOSED → HOP_PLAN_READY → HOP_IMPL_STARTED → HOP_IMPL_PROPOSED → HOP_IMPL_READY → EXECUTING → COMPLETED/FAILED/CANCELLED
 *    - Shown in hop list and details as status badge
 * 
 * 3. EXECUTION STATUS (ExecutionStatus)
 *    - Individual step state: PROPOSED → READY_TO_CONFIGURE → READY_TO_EXECUTE → EXECUTING → COMPLETED/FAILED/CANCELLED
 *    - Shown in step details as status badge
 */

export interface StatusDisplay {
    color: string;
    icon: React.ReactElement;
    text: string;
}

export function getStatusBadgeClass(color: string): string {
    const baseClasses = 'px-2 py-1 rounded text-xs font-medium flex items-center gap-1';
    switch (color) {
        case 'green':
            return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400`;
        case 'yellow':
            return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400`;
        case 'red':
            return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400`;
        case 'blue':
            return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400`;
        default:
            return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-400`;
    }
} 