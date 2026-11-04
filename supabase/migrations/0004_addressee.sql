-- Who each line is said to (Spark director, validated): a member id, or "all" for the whole table.
-- The figures look at that person; the camera frames the two of them.
alter table renders add column if not exists addressee text;
