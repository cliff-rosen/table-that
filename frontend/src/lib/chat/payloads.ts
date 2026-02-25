/**
 * Global Payload Handler Registrations
 *
 * This file registers render functions for common payload types.
 * These are automatically registered when the chat library is imported.
 *
 * Note: Page-specific callbacks (onAccept, onReject) are still provided
 * by individual pages when using ChatTray.
 */

import React from 'react';
import { registerPayloadHandler } from './payloadRegistry';
import SchemaProposalCard from '../../components/chat/SchemaProposalCard';
import DataProposalCard from '../../components/chat/DataProposalCard';
import type { SchemaProposalData } from '../../components/chat/SchemaProposalCard';
import type { DataProposalData } from '../../components/chat/DataProposalCard';

// ============================================================================
// Schema Proposal
// ============================================================================

registerPayloadHandler('schema_proposal', {
  render: (payload: SchemaProposalData, callbacks) =>
    React.createElement(SchemaProposalCard, {
      data: payload,
      onAccept: callbacks.onAccept,
      onReject: callbacks.onReject,
    }),
  renderOptions: {
    headerTitle: 'Schema Proposal',
    headerIcon: '📋',
  },
});

// ============================================================================
// Data Proposal
// ============================================================================

registerPayloadHandler('data_proposal', {
  render: (payload: DataProposalData, callbacks) =>
    React.createElement(DataProposalCard, {
      data: payload,
      onAccept: callbacks.onAccept,
      onReject: callbacks.onReject,
    }),
  renderOptions: {
    headerTitle: 'Data Proposal',
    headerIcon: '📊',
  },
});
