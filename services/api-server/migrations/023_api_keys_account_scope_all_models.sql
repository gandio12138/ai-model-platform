update api_keys
   set model_whitelist = null,
       updated_at = now()
 where model_whitelist is not null;

comment on column api_keys.project_id is
  'Optional source project for audit/UI attribution. API keys are visible by tenant customer account across Web/App projects.';

comment on column api_keys.model_whitelist is
  'Deprecated. API keys can call all active priced context-bearing models in the tenant; per-key model allowlists are ignored.';
