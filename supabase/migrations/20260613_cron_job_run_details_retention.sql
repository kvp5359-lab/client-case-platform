-- Аудит производительности 2026-06-13.
-- cron.job_run_details рос линейно и бесконечно (22 МБ, #2 таблица в БД):
-- два ежеминутных cron-джоба пишут ~2880 строк/день, очистки не было.
-- Диагностика кронов в доках смотрит максимум 10 последних записей —
-- недельной ретенции хватает с запасом.
-- Применено в прод через cron.schedule (jobid=6) 2026-06-13.

SELECT cron.schedule(
  'cleanup-cron-job-run-details',
  '17 4 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);
