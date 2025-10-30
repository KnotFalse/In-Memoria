# PHP QA Fixtures

These lightweight fixtures emulate common PHP ecosystems without bundling vendor code:

- `laravel-demo`: Composer project declaring `laravel/framework`, PSR-4 namespace `App\\` with a sample controller.
- `symfony-demo`: Composer project declaring `symfony/framework-bundle`, PSR-4 namespace `App\\` with a demo controller.
- `wordpress-demo`: Minimal plugin file exercising procedural WordPress patterns.

They are used by `scripts/php-integration-check.ts` to validate parser/extractor heuristics and performance instrumentation.
