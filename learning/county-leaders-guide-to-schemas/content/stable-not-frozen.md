Software changes. Programs change. Reporting requirements change. A schema that could never change would become a liability.

**Stable** means predictable, documented, and managed—not frozen forever.

Imagine that an application currently has only two request statuses: **Open** and **Closed**. The department adds **Waiting for Customer**. The change may be sensible, but a dashboard that assumes every record is either Open or Closed could now give a misleading result.

This is where discipline matters. Before a new status appears in production, teams should know:

- what the new status means;
- which reports, forms, and connected applications rely on the old values;
- how existing records will be handled;
- who will test the change; and
- how users and vendors will be informed.

A *version* is simply a way to label which set of rules applies. A *change notice* tells other teams what has changed. These are routine management tools, not exotic engineering rituals.

**Leadership question:** *Is this schema stable and versioned? Who tells other systems when it changes?*

Be wary of "We change fields whenever the vendor needs to." The real concern is not change; it is change without coordination.
