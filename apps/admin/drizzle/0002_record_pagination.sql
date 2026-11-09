-- Supports stable parish-scoped keyset paging without a growing OFFSET.
CREATE INDEX IF NOT EXISTS `idx_sacramental_records_parish_date_id`
  ON `sacramental_records` (`parish_id`, `event_date`, `id`);
