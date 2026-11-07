-- pgTAP 011: validasi template tema (Prompt 3 Fase B).
begin;
select plan(8);

create temporary table tap_theme as
  select '{"layout":"standard","font_preset":"rounded","palette":{
    "primary":"#0F766E","secondary":"#C2410C","background":"#F2F7F6",
    "surface":"#FFFFFF","border":"#D3E1DE","text_primary":"#0E1F1D",
    "text_secondary":"#455E5A","success":"#15803D","warning":"#B45309",
    "error":"#B91C1C"}}'::jsonb as t;

select ok(app.theme_is_valid((select t from tap_theme)), 'tema lama tanpa kunci template tetap valid');
select ok(app.theme_is_valid((select t from tap_theme) || '{"template":"default"}'::jsonb), 'template default valid');
select ok(app.theme_is_valid((select t from tap_theme) || '{"template":"neobrutalism"}'::jsonb), 'template neobrutalism valid');
select ok(app.theme_is_valid((select t from tap_theme) || '{"template":"archive"}'::jsonb), 'template archive valid');
select ok(not app.theme_is_valid((select t from tap_theme) || '{"template":"lain"}'::jsonb), 'template tak dikenal ditolak');
select ok(not app.theme_is_valid((select t from tap_theme) || '{"font_preset":"comic"}'::jsonb), 'validasi kunci lain tidak berubah');
select ok(has_function_privilege('authenticated', 'app.theme_is_valid(jsonb)', 'execute'), 'EXECUTE authenticated dipertahankan');
select ok(has_function_privilege('anon', 'app.theme_is_valid(jsonb)', 'execute'), 'EXECUTE anon dipertahankan');

select * from finish();
rollback;
