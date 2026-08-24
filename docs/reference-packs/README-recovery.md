# Recovering the pack pixels

The approved images live outside the repository at `~/rw/reference-packs/<asset>/v001/`. That is
**one copy on one machine**: `~/rw` is a plain local directory, not a git worktree, not iCloud, and
this machine has no Time Machine destination configured. If the disk goes, the files go.

They are recoverable, and this file says exactly how, because they are the only input the modelling
tickets have.

## What survives elsewhere

Every approved image is still held server-side in its Reve album, under the project owner's account.
Each pack record names its album id, and — since 2026-08-24 — the Reve image id of every approved
view alongside its sha256.

## The recovery is deterministic, and that was tested

Re-downloading an approved image through the site's download control returns a **byte-identical**
file. Verified on 2026-08-24 against `sea-stack-mat-summit-tops-v001.png`: the re-downloaded file's
sha256 matched the recorded one exactly. Reve stores the PNG rather than regenerating it, so a
recovery does not re-roll the image and the recorded hashes remain the check.

## The procedure

For each row of a pack record's approved-views table: open
`https://app.reve.com/albums/<album id>/images/<Reve image id>`, press the download control, rename
the downloaded file to the row's filename, and verify its sha256 against the row. The hash column is
what makes the recovery checkable rather than merely plausible.

## What is not recoverable this way

If the Reve account or its albums are lost, the packs are lost. Nothing here regenerates them: the
service guarantees no seed, four of the approved views were produced by manual region edits that no
prompt reproduces, and re-prompting would produce different images that the recorded hashes would
correctly reject.

**So the account is a single point of failure for the modelling line.** A second copy of the pixels
somewhere durable would remove it; that is the project owner's call, not a decision this record makes.

## The recovery was exercised, not just described

On 2026-08-24 all nine hero vessel views were re-downloaded from their recorded Reve image ids and
compared against the pack files: **9 of 9 matched byte for byte**. Two things came out of the
exercise that the description alone would not have caught:

- **One recorded hash was wrong.** `hero-vessel-elev-stern-v001.png` was written as
  `18bdb15ef2103838`; the file's actual hash is `18bdb15ef210383b`. A single transposed character
  in the last position, which no reading would have found and which would have failed a future
  recovery as if the file were corrupt. Corrected.
- **Downloaded filenames are not the recorded filenames.** The service names files from its own
  image titles, which record the operation rather than the view — the hero vessel's identity anchor
  downloads as `Reframed image.png` and its top view as `Remove Starboard Guard.png`. It also
  rewrites `&` to `_`. The rename step in the procedure above is therefore not cosmetic: without the
  Reve image id column, matching a downloaded file back to a pack row would rest on those titles.

Recovering a pack you have never recovered is not a plan; it is a hope. This one has now been run
once end to end on the pack the modelling line reaches first.
