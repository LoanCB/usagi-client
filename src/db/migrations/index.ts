import m001 from "./001_initial.sql?raw";
import m002 from "./002_add_description.sql?raw";
import m003 from "./003_settings.sql?raw";
import m004 from "./004_tags_project_scope.sql?raw";
import m005 from "./005_project_groups.sql?raw";
import m006 from "./006_extend_priority.sql?raw";
import m007 from "./007_sync_columns.sql?raw";
import m008 from "./008_sort_key.sql?raw";
import m009 from "./009_sync_outbox.sql?raw";
import m010 from "./010_device_id_restamp.sql?raw";
import m011 from "./011_reset_sort_keys.sql?raw";

/** Ordered migration list. Append only — the index is the schema version. */
export const ALL_MIGRATIONS = [
	m001,
	m002,
	m003,
	m004,
	m005,
	m006,
	m007,
	m008,
	m009,
	m010,
	m011,
];
