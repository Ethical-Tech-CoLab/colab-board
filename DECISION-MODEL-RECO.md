# Decision-model recommendation: opt-in local idea suggestions

Date: 2026-10-11. Public-source proposal; no runtime change.
Reviewed [README](https://github.com/Ethical-Tech-CoLab/colab-board/blob/60e99a0bf42198c276188480b8b359aaa6299b24/README.md).
Assessment is documentation-led.

## Default decision

Keep drawing, spatial transforms, autosave, event provenance, undo/redo and
replay deterministic and local-first. No decision model is needed to operate
the board or interpret pen/touch events.

If users request idea organization, test an explicit opt-in suggestion layer
over selected text notes. A bounded model may propose a theme or related-note
link, including no relation/unknown. It must never move, merge or delete notes
without user confirmation or rewrite the chronological event record.

## Alternatives and test

Start with manual labels, lexical search and licensed local embeddings.
Hosted Jev, Microsoft-Decision-1 or Sage require a separate data-egress decision;
no cloud key belongs in a static browser bundle. The
[bounded-task guide](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)
is architectural reference, not a reason to change the privacy contract.

Use synthetic workshops with overlapping themes, ambiguous shorthand and
deliberately unrelated notes. Split by workshop, measure suggestion precision,
missed relationships, unknown rate and time saved. Preserve participants'
different interpretations rather than imposing one "correct" cluster.

## Gate

Default off; selected text only; no personal profiling or hidden upload.
Any local model needs hardware/license testing and a no-model fallback.
Exact proprietary checkpoints are not local equivalents. Measure complete cost
and user benefit before adding a dependency; none is currently established.
