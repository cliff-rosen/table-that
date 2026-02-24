# Async Migration Plan

## Goal
Complete migration to async SQLAlchemy - remove ALL sync `get_db` usage from routers.

## Phase 1: Add Missing Async Methods to Services

### 1.1 user_service.py - Add missing methods:
- [ ] async_update_role
- [ ] async_delete_user
- [ ] async_assign_to_org

### 1.2 research_stream_service.py - Add missing methods:
- [ ] async_list_global_streams
- [ ] async_get_global_stream
- [ ] async_set_stream_scope_global
- [ ] async_delete_global_stream
- [ ] async_get_all_streams_with_chat_instructions

### 1.3 organization_service.py - Add missing methods:
- [ ] async_list_organizations
- [ ] async_get_organization
- [ ] async_get_organization_with_stats
- [ ] async_create_organization
- [ ] async_delete_organization

### 1.4 subscription_service.py - Add missing methods:
- [ ] async_get_global_streams_for_org (sync version returns object, need to check)
- [ ] async_subscribe_org_to_global_stream (sync version)
- [ ] async_unsubscribe_org_from_global_stream (sync version)

### 1.5 report_service.py - Add missing methods:
- [ ] async_get_curation_view
- [ ] async_get_pipeline_analytics
- [ ] async_exclude_article
- [ ] async_include_article
- [ ] async_reset_curation
- [ ] async_update_article_in_report
- [ ] async_update_report_content
- [ ] async_get_report_with_access

### 1.6 wip_article_service.py - Add missing methods:
- [ ] async_update_curation_notes

### 1.7 article_service.py - Need async DI provider and methods

### 1.8 Other services as discovered

## Phase 2: Migrate Routers (in order of dependency)

### 2.1 admin.py
- Uses: user_service, organization_service, subscription_service, invitation_service, research_stream_service

### 2.2 curation.py
- Uses: report_service, wip_article_service, email_service, report_summary_service

### 2.3 research_streams.py
- Finish remaining sync endpoints

### 2.4 articles.py
- Uses: article_service

### 2.5 chat_stream.py
- Review and migrate

### 2.6 tracking.py
- Uses: user_tracking_service

### 2.7 Remaining routers:
- document_analysis.py
- google_scholar.py
- lab.py
- prompt_workbench.py
- refinement_workbench.py
- tools.py

## Phase 3: Cleanup
- Remove sync `get_db` from database.py exports (or deprecate)
- Verify no sync imports remain
- Test all endpoints

## Execution Order
1. Services first (add async methods)
2. Routers second (migrate to async)
3. Cleanup last
