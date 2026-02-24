/**
 * Chat Library Exports
 */

export {
    registerPayloadHandler,
    getPayloadHandler,
    getRegisteredPayloadTypes,
    hasPayloadHandler
} from './payloadRegistry';

// Import payloads to register them on app load
import './payloads';
