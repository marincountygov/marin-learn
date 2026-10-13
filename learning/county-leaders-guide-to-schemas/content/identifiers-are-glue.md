Names are useful to people. **Identifiers** are what let systems reliably distinguish one record from another.

The facilities team may call a repair **WO-2047**. The finance team may call its payment **PAY-990**. Those values are not wrong. But a system cannot safely assume they refer to the same job just because both records mention "Main Street."

Someone needs to define the connection. Sometimes both systems can carry the same stable work-order number. Sometimes there must be an approved lookup linking one system's ID to the other's. Either approach can work when it is explicit and tested.

The same problem becomes more serious with people, services, and other sensitive records. Two records with similar names are not automatically the same person. Matching must use appropriately authorized methods and data—not a guess based on a name or address.

## What leaders should ask

- Which field uniquely identifies a record in this application?
- Does that identifier remain the same when other fields are updated?
- How does the next system recognize the corresponding record?
- What happens when the match is missing, duplicated, or uncertain?

**Leadership question:** *Do these systems have reliable identifiers, and can staff show how they match?*

An ID is not a promise of accuracy, but it gives teams a dependable starting point for reconciliation.
