-- Every stamp written before this migration carries the literal device id
-- "local", because LOCAL_DEVICE_ID was a hardcoded placeholder. Spec §5 breaks
-- LWW ties by comparing device ids, so those stamps cannot lose a tie against
-- another device's — nor win one. Blanking the device half leaves the
-- timestamps intact (they are the primary comparison) and marks these stamps as
-- authorless, which is the truth: we cannot know which install wrote them.
--
-- The timestamps are what matter for merging; the device id only breaks exact
-- ties, which are rare. Rewriting to the *current* device's id would be worse:
-- it would claim authorship of writes this install may never have made.
--
-- Consequence, deliberate rather than incidental: "" sorts lexicographically
-- below every real device id, since a UUID is never empty. These stamps
-- therefore do not merely sit out the tie-break — they lose every exact-
-- timestamp tie against an attributed write, permanently, until a real device
-- rewrites the field. That is the safer default: prefer the write whose author
-- we know over one we cannot identify.
--
-- This assumes §5 resolves ties in favour of the *greater* device id. The spec
-- says "lexicographic" without fixing a direction, so whoever implements the
-- merge must pick greater-wins: under smaller-wins these authorless stamps
-- would beat every attributed write instead, silently inverting the intent.
UPDATE tasks
SET field_updated_at = REPLACE(field_updated_at, '"d":"local"', '"d":""')
WHERE field_updated_at LIKE '%"d":"local"%';

UPDATE projects
SET field_updated_at = REPLACE(field_updated_at, '"d":"local"', '"d":""')
WHERE field_updated_at LIKE '%"d":"local"%';

UPDATE tags
SET field_updated_at = REPLACE(field_updated_at, '"d":"local"', '"d":""')
WHERE field_updated_at LIKE '%"d":"local"%';

UPDATE project_groups
SET field_updated_at = REPLACE(field_updated_at, '"d":"local"', '"d":""')
WHERE field_updated_at LIKE '%"d":"local"%';
