-- 003_seed_sources.sql : known RSS/Atom feeds, verified live on 2026-10-12 (valid feed, items dated within the last 3 weeks).
-- Idempotent. Run AFTER the VCs have been imported (it matches on firm_name). Only touches vc_sources.
-- Stale or absent feeds were deliberately left out (BEENEXT, Axilor: last post 2023; Stellaris Medium: Jan 2025).

insert into public.vc_sources (vc_id, feed_url, source_type)
select p.id, s.feed_url, s.source_type
from (values
  ('Y Combinator',    'https://www.ycombinator.com/blog/feed',   'firm_blog'),
  ('Lightspeed India','https://lsvp.com/feed/',                  'firm_blog'),
  ('Chiratae Ventures','https://www.chiratae.com/feed/',         'firm_blog'),
  ('Speciale Invest', 'https://www.specialeinvest.com/blog-feed.xml', 'firm_blog'),
  ('Antler India',    'https://www.antler.co/blog/rss.xml',      'firm_blog')
) as s(firm_name, feed_url, source_type)
join public.vc_pipeline p on lower(p.firm_name) = lower(s.firm_name)
on conflict (vc_id, feed_url) do nothing;
