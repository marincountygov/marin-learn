Consider a routine County facilities repair. A work-order application tracks the problem, the crew, and whether the repair is complete. A finance application tracks the purchase, invoice, and payment.

Leadership wants one answer: **How much did we spend completing these repairs?**

Both applications can export files. That does not mean they can automatically produce one reliable answer.

| Facilities application | Finance application | Leadership concern |
| --- | --- | --- |
| Work order number | Invoice reference | Do both values point to the same job? |
| Completed | Paid | Is the work finished, or has an invoice been paid? |
| Work completion date | Payment date | Which date belongs in this report? |

The two systems do not have to use identical names. They do need **a documented way to connect the right records and preserve the right meanings**.

Staff might build a mapping, which is simply an agreed translation between two sets of fields. They should demonstrate it with real-looking test records, including a missing invoice and a job with several invoices.

**Leadership question:** *Can you show me how the schemas of these applications fit together for this work order?*

A useful demonstration ends with matching records and a clear explanation of what does **not** match. A vague assurance that "the systems integrate" is not evidence by itself.
