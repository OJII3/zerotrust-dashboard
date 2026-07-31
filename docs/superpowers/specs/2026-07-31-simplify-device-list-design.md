# Simplify Device List Design

## Goal

Simplify the device list at every viewport width, with particular attention to
small screens. Preserve the complete device information in the details drawer.

## Scope

The list will contain four columns:

1. Status
2. Machine
3. Addresses
4. Last Seen

The existing Version column will be removed from the list. Client and operating
system versions will remain available in the details drawer, searchable, and
usable as a sort key.

## List presentation

### Status

Each status cell will show only the existing colored status dot. The visible
status label and relative last-seen text will be removed from this cell.

The dot will retain an accessible status name for assistive technology and a
tooltip for pointer users. Existing status colors will not change.

### Addresses

Each address cell will show only WARP virtual IPv4 addresses from device
registrations. DNS hostnames and IPv6 addresses will not appear in the list.
They will remain available in the details drawer.

The existing unavailable and empty states will remain:

- `Unavailable` when registration data could not be fetched.
- `—` when registration data is available but no IPv4 address exists.

Address copy buttons will remain.

### Version

The Version header, cells, column sizing, and list-specific rendering function
will be removed. No version data will be removed from the API response or the
details drawer.

## Responsive behavior

The list will remain a table on desktop and mobile. On viewports up to 1023px:

- Remove the table's fixed 980px minimum width.
- Use a narrow fixed width for Status.
- Reduce cell padding and copy-button width.
- Allocate the remaining width primarily to Machine, Addresses, and Last Seen.
- Truncate long machine and address content where necessary.

The target behavior is a four-column list that fits the viewport without
horizontal scrolling under normal phone widths. Device details remain
accessible by selecting a row.

## Unchanged behavior

- The details drawer retains DNS hostname, IPv6, OS version, and client version.
- Search continues to include DNS hostname, IPv6, OS version, and client
  version.
- Client version remains available in the sort selector.
- Filters, row selection, refresh behavior, and summary metrics do not change.

## Verification

Add an automated regression test for the generated dashboard HTML. It will
verify that:

- The list has Status, Machine, Addresses, and Last Seen headers.
- The list does not have a Version header.
- Status list markup exposes the status accessibly without visible label text.
- Address list rendering selects IPv4 only and excludes DNS and IPv6.
- The details drawer still renders DNS hostname, IPv6, and client version.

Run the focused regression test, type checking, and the existing project check
before completion.
