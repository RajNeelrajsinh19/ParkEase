import json
import random
import string
from datetime import date, datetime, time
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


APP_TITLE = "ParkEase — Smart Parking Management & Slot Booking"
ADMIN_EMAIL = "neelrajsinhraj2006@gmail.com"
ADMIN_PASSWORD = "Admin@123"
PAYEE_PHONE = "8320066092"
PAYEE_VPA = "8320066092@upi"
PAYEE_NAME = "ParkEase"

ZONES = [
    {"id": "A", "name": "Zone A · Ground Floor", "type": "Car", "rate": 30, "count": 12},
    {"id": "B", "name": "Zone B · Level 1", "type": "Car", "rate": 25, "count": 12},
    {"id": "C", "name": "Zone C · EV Charging", "type": "EV", "rate": 50, "count": 6},
    {"id": "D", "name": "Zone D · Two-Wheeler", "type": "Bike", "rate": 15, "count": 10},
]

SEED_ZONE_STATUS = {
    "A": {"occupied": [0, 3, 6, 9], "maintenance": []},
    "B": {"occupied": [1, 2, 7], "maintenance": [8]},
    "C": {"occupied": [0, 4], "maintenance": []},
    "D": {"occupied": [1, 3, 5, 6, 8], "maintenance": []},
}


def money(value: float) -> str:
    return f"₹{round(float(value or 0))}"


def make_booking_id() -> str:
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
    return f"PE-{suffix[:4]}-{suffix[4:]}"


def local_date() -> date:
    return datetime.now().date()


def default_slots() -> list[dict]:
    slots: list[dict] = []
    for zone in ZONES:
        for index in range(zone["count"]):
            slots.append(
                {
                    "code": f'{zone["id"]}-{index + 1:02d}',
                    "zone": zone["id"],
                    "type": zone["type"],
                    "status": "available",
                }
            )

    for zone_id, seed in SEED_ZONE_STATUS.items():
        for index, slot in enumerate([slot for slot in slots if slot["zone"] == zone_id]):
            if index in seed["maintenance"]:
                slot["status"] = "maintenance"
            if index in seed["occupied"]:
                slot["status"] = "occupied"

    return slots


def default_bookings() -> list[dict]:
    return []


def default_users() -> list[dict]:
    return [
        {
            "name": "Neel Rajsinh",
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "role": "Admin",
        }
    ]


def get_zone(zone_id: str) -> dict:
    return next(zone for zone in ZONES if zone["id"] == zone_id)


def slot_by_code(code: str) -> dict | None:
    return next((slot for slot in st.session_state.slots if slot["code"] == code), None)


def booking_amount(booking: dict) -> float:
    return float(booking.get("finalAmount") or booking.get("amount") or 0)


def booking_status_label(status: str) -> str:
    return status if status else "Confirmed"


def booking_status_class(status: str) -> str:
    return {
        "Confirmed": "park-status-confirmed",
        "Active": "park-status-active",
        "Completed": "park-status-completed",
        "Cancelled": "park-status-cancelled",
    }.get(status, "park-status-confirmed")


def slot_status_label(status: str) -> str:
    return {
        "available": "Available",
        "reserved": "Booked",
        "occupied": "Booked",
        "maintenance": "Unavailable",
    }.get(status, "Available")


def booking_slot_code(booking: dict) -> str:
    return booking.get("slot") or booking.get("slotCode") or ""


def booking_is_open(booking: dict) -> bool:
    return booking.get("status") in {"Confirmed", "Active"}


def user_bookings() -> list[dict]:
    current = st.session_state.get("current_user")
    if not current:
        return []
    return [booking for booking in st.session_state.bookings if booking.get("userEmail") == current["email"]]


def persist_slot_state() -> None:
    for booking in st.session_state.bookings:
        if booking_is_open(booking):
            slot = slot_by_code(booking_slot_code(booking))
            if slot and slot["status"] != "maintenance":
                slot["status"] = "occupied" if booking["status"] == "Active" else "reserved"


def create_qr_html(payload: str) -> str:
    return f"""
    <div style='display:flex;justify-content:center;align-items:center;padding:0.2rem;'>
      <div id='park-qr' style='width:170px;height:170px;background:#fff;border-radius:16px;padding:8px;'></div>
    </div>
    <script src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'></script>
    <script>
      const qrRoot = document.getElementById('park-qr');
      if (window.QRCode && qrRoot) {{
        new QRCode(qrRoot, {{
          text: {json.dumps(payload)},
          width: 154,
          height: 154,
          correctLevel: QRCode.CorrectLevel.M
        }});
      }}
    </script>
    """


def add_base_css() -> None:
    st.markdown(
        """
        <style>
        :root {
          --bg:#0B0E14;
          --bg-elev:#131924;
          --surface:#19212F;
          --surface-2:#1F2939;
          --text:#F1F3F0;
          --text-dim:#8B94A7;
          --text-faint:#5D6779;
          --accent:#FFB020;
          --accent-2:#FFC960;
          --accent-ink:#1A1204;
          --available:#2FAE6B;
          --occupied:#E5484D;
          --reserved:#4C8DFF;
          --maintenance:#5B6472;
          --shadow:0 20px 50px -20px rgba(0,0,0,0.65);
        }
        .stApp {
          background: radial-gradient(1100px 520px at 12% -8%, rgba(255,176,32,0.08), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(76,141,255,0.06), transparent 55%), var(--bg);
          color: var(--text);
          font-family: 'Inter', sans-serif;
        }
        .park-shell {
          background: rgba(19,25,36,0.75);
          border: 1px solid rgba(39,49,66,0.8);
          border-radius: 20px;
          padding: 1.25rem 1.3rem;
          box-shadow: var(--shadow);
          margin-bottom: 1rem;
        }
        .park-brand {
          display:flex; align-items:center; gap: 0.8rem; font-family: 'Space Grotesk', sans-serif;
          font-weight:700; font-size: 1.2rem;
        }
        .park-badge {
          width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(155deg,var(--accent),#e8930c);
          color: var(--accent-ink); display:flex; align-items:center; justify-content:center; font-weight:700;
        }
        .park-title {
          font-family: 'Space Grotesk', sans-serif; font-size: 2.1rem; margin: 0.4rem 0 0.2rem 0;
        }
        .park-sub { color: var(--text-dim); line-height: 1.6; }
        .park-chip {
          display:inline-block; padding:0.35rem 0.75rem; border-radius:999px; background: rgba(255,176,32,0.12); color: var(--accent);
          border: 1px solid rgba(255,176,32,0.28); font-size: 0.82rem; margin-right: 0.4rem;
        }
        .park-card {
          background: rgba(25,33,47,0.88); border:1px solid rgba(39,49,66,0.9); border-radius: 16px; padding: 1rem; box-shadow: var(--shadow);
        }
        .park-zone-header { display:flex; justify-content:space-between; gap:1rem; align-items:center; margin-bottom:0.75rem; }
        .park-zone-name { font-family: 'Space Grotesk', sans-serif; font-size: 1.1rem; font-weight:700; }
        .park-zone-meta { color: var(--text-faint); font-family: 'JetBrains Mono', monospace; font-size: 0.84rem; }
        .park-slot-grid { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 0.6rem; }
        @media (max-width: 900px) { .park-slot-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
        @media (max-width: 640px) { .park-slot-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
        .park-slot {
          border-radius: 14px; padding: 0.8rem 0.7rem; text-align:center; border:1px solid rgba(39,49,66,0.9);
          background: rgba(16,22,32,0.95); min-height: 92px;
        }
        .park-slot.available { color: var(--available); border-color: rgba(47,174,107,0.35); }
        .park-slot.occupied { color: var(--occupied); border-color: rgba(229,72,77,0.35); }
        .park-slot.reserved { color: var(--reserved); border-color: rgba(76,141,255,0.35); }
        .park-slot.maintenance { color: var(--maintenance); border-color: rgba(91,100,114,0.45); }
        .park-slot.selected { outline: 2px solid var(--accent); box-shadow: 0 0 0 2px rgba(255,176,32,0.14); }
        .park-slot-code { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 0.95rem; }
        .park-slot-status { font-size: 0.72rem; letter-spacing: 0.07em; text-transform: uppercase; margin-top: 0.2rem; }
        .park-kpis { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:0.75rem; }
        @media (max-width: 900px) { .park-kpis { grid-template-columns: repeat(2, minmax(0,1fr)); } }
        .park-kpi { background: rgba(19,25,36,0.88); border:1px solid rgba(39,49,66,0.9); border-radius:16px; padding:1rem; }
        .park-kpi-value { font-family:'JetBrains Mono', monospace; font-size:1.4rem; font-weight:700; }
        .park-kpi-label { color: var(--text-faint); font-size:0.8rem; text-transform:uppercase; letter-spacing:0.06em; }
        .park-divider { height:1px; background: rgba(39,49,66,0.9); margin: 1rem 0; }
        .park-muted { color: var(--text-dim); }
        .park-ticket {
          background: linear-gradient(180deg, rgba(19,25,36,0.95), rgba(16,21,31,0.95));
          border: 1px dashed rgba(39,49,66,0.9); border-radius: 18px; padding: 1rem;
        }
        .park-ticket-grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:0.75rem; margin-top:0.8rem; }
        .park-ticket-row { background: rgba(31,41,57,0.85); border-radius: 12px; padding:0.7rem 0.8rem; }
        .park-ticket-row span { display:block; color: var(--text-faint); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; }
        .park-ticket-row b { font-family:'JetBrains Mono', monospace; font-size:0.94rem; }
        .park-status-confirmed { color: var(--reserved); }
        .park-status-active { color: var(--available); }
        .park-status-completed { color: var(--text-dim); }
        .park-status-cancelled { color: var(--occupied); }
        </style>
        """,
        unsafe_allow_html=True,
    )


def init_state() -> None:
    st.session_state.setdefault("slots", default_slots())
    st.session_state.setdefault("bookings", default_bookings())
    st.session_state.setdefault("users", default_users())
    st.session_state.setdefault("current_user", None)
    st.session_state.setdefault("active_zone", "A")
    st.session_state.setdefault("active_type_filter", "all")
    st.session_state.setdefault("selected_slot", None)
    st.session_state.setdefault("booking_data", {})
    st.session_state.setdefault("payment_method", "upi")
    st.session_state.setdefault("selected_tab", "Home")
    st.session_state.setdefault("auth_message", "")
    st.session_state.setdefault("ticket_booking_id", None)


def sync_open_bookings_to_slots() -> None:
    for slot in st.session_state.slots:
        if slot["status"] == "maintenance":
            continue
        open_booking = next(
            (booking for booking in st.session_state.bookings if booking_is_open(booking) and booking_slot_code(booking) == slot["code"]),
            None,
        )
        if open_booking:
            slot["status"] = "occupied" if open_booking["status"] == "Active" else "reserved"


def render_header() -> None:
    st.markdown(
        f"""
        <div class="park-shell">
          <div class="park-brand"><div class="park-badge">P</div>ParkEase</div>
          <div class="park-title">Smart Parking Management &amp; Slot Booking</div>
          <div class="park-sub">Plan, book, pay, and manage parking in a polished Streamlit app that mirrors the existing ParkEase booking rules and branding.</div>
          <div style="margin-top:0.8rem;">
            <span class="park-chip">ParkEase</span>
            <span class="park-chip">DEMO payment</span>
            <span class="park-chip">localStorage parity via session state</span>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_home() -> None:
    total = len(st.session_state.slots)
    occupied = sum(1 for slot in st.session_state.slots if slot["status"] in {"occupied", "reserved"})
    available = sum(1 for slot in st.session_state.slots if slot["status"] == "available")
    percent = round((occupied / total) * 100) if total else 0

    st.markdown("### Home")
    st.markdown("ParkEase keeps the original green/open, red/occupied, blue/reserved language and the same zone structure.")

    col1, col2, col3, col4 = st.columns(4)
    kpi_values = [
        (col1, total, "Total slots"),
        (col2, available, "Available now"),
        (col3, occupied, "Occupied / booked"),
        (col4, f"{percent}%", "Live occupancy"),
    ]
    for col, value, label in kpi_values:
        with col:
            st.markdown(
                f"""
                <div class="park-kpi">
                  <div class="park-kpi-value">{value}</div>
                  <div class="park-kpi-label">{label}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    st.markdown('<div class="park-divider"></div>', unsafe_allow_html=True)
    st.markdown("##### Live zone snapshot")
    zone_cols = st.columns(2)
    with zone_cols[0]:
        render_zone_card("A")
    with zone_cols[1]:
        render_zone_card("B")
    zone_cols = st.columns(2)
    with zone_cols[0]:
        render_zone_card("C")
    with zone_cols[1]:
        render_zone_card("D")


def render_zone_card(zone_id: str, allow_select: bool = False) -> None:
    zone = get_zone(zone_id)
    zone_slots = [slot for slot in st.session_state.slots if slot["zone"] == zone_id]
    st.markdown(
        f"""
        <div class="park-card">
          <div class="park-zone-header">
            <div>
              <div class="park-zone-name">{zone['name']}</div>
              <div class="park-zone-meta">Rate {money(zone['rate'])}/hr · {zone['type']}</div>
            </div>
            <div class="park-zone-meta">{sum(1 for s in zone_slots if s['status'] == 'available')} available</div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    grid_cols = st.columns(4)
    for index, slot in enumerate(zone_slots):
        with grid_cols[index % 4]:
            slot_class = slot["status"]
            if st.session_state.selected_slot == slot["code"]:
                slot_class += " selected"
            st.markdown(
                f"""
                <div class="park-slot {slot_class}">
                  <div class="park-slot-code">{slot['code']}</div>
                  <div class="park-slot-status">{slot_status_label(slot['status'])}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            if allow_select and slot["status"] == "available":
                if st.button(f"Select {slot['code']}", key=f"select-{slot['code']}"):
                    st.session_state.selected_slot = slot["code"]
                    st.session_state.booking_data.setdefault("zone", zone_id)
                    st.session_state.booking_data.setdefault("duration", 2)
                    st.rerun()


def render_find_book() -> None:
    st.markdown("### Find & Book")
    st.markdown("Choose a zone, select an available slot, then fill the booking form. Payment is clearly demo-only.")

    zone_names = [f"Zone {zone['id']}" for zone in ZONES]
    selected_zone_index = next(i for i, zone in enumerate(ZONES) if zone["id"] == st.session_state.active_zone)
    selected_zone_name = st.selectbox("Parking zone", zone_names, index=selected_zone_index)
    st.session_state.active_zone = selected_zone_name.split()[-1]

    vehicle_types = ["all", "Car", "Bike", "EV"]
    type_label = st.radio("Filter by vehicle type", vehicle_types, horizontal=True, index=vehicle_types.index(st.session_state.active_type_filter))
    st.session_state.active_type_filter = type_label

    zone = get_zone(st.session_state.active_zone)
    zone_slots = [slot for slot in st.session_state.slots if slot["zone"] == zone["id"]]
    if st.session_state.active_type_filter != "all":
        zone_slots = [slot for slot in zone_slots if slot["type"] == st.session_state.active_type_filter]

    st.markdown(
        f"""
        <div class="park-card">
          <div class="park-zone-header">
            <div>
              <div class="park-zone-name">{zone['name']}</div>
              <div class="park-zone-meta">{money(zone['rate'])}/hr · {zone['type']}</div>
            </div>
            <div class="park-zone-meta">{sum(1 for slot in zone_slots if slot['status'] == 'available')} available</div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    render_slot_picker(zone_slots)
    render_booking_form(zone)


def render_slot_picker(zone_slots: list[dict]) -> None:
    st.markdown("#### Parking slots")
    cols = st.columns(4)
    for index, slot in enumerate(zone_slots):
        with cols[index % 4]:
            classes = [slot["status"]]
            if st.session_state.selected_slot == slot["code"]:
                classes.append("selected")
            st.markdown(
                f"""
                <div class="park-slot {' '.join(classes)}">
                  <div class="park-slot-code">{slot['code']}</div>
                  <div class="park-slot-status">{slot_status_label(slot['status'])}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            if slot["status"] == "available":
                if st.button(f"Select {slot['code']}", key=f"book-select-{slot['code']}"):
                    st.session_state.selected_slot = slot["code"]
                    st.session_state.booking_data["zone"] = zone_slots[0]["zone"] if zone_slots else st.session_state.active_zone
                    st.rerun()


def render_booking_form(zone: dict) -> None:
    st.markdown("#### Booking form")
    with st.form("booking_form", clear_on_submit=False):
        cols = st.columns(2)
        with cols[0]:
            vehicle_number = st.text_input("Vehicle number", value=st.session_state.booking_data.get("vehicle_number", ""), placeholder="e.g. GJ06 AB 1234")
            booking_date = st.date_input("Date", value=st.session_state.booking_data.get("date", local_date()), min_value=local_date())
        with cols[1]:
            booking_time = st.time_input("Entry time", value=st.session_state.booking_data.get("time", datetime.now().time().replace(second=0, microsecond=0)))
            duration_hours = st.number_input("Duration (hours)", min_value=1, max_value=8, value=int(st.session_state.booking_data.get("duration", 2)), step=1)

        customer_name = st.text_input("Customer name", value=st.session_state.booking_data.get("customer_name", ""))
        customer_email = st.text_input("Customer email", value=st.session_state.booking_data.get("customer_email", ""))
        payment_method = st.radio("Payment method", ["UPI", "Card"], horizontal=True, index=0 if st.session_state.payment_method == "upi" else 1)

        submitted = st.form_submit_button("Continue to booking confirmation")

    if submitted:
        errors = []
        if not vehicle_number.strip():
            errors.append("Vehicle number is required.")
        if not customer_name.strip():
            errors.append("Customer name is required.")
        if not customer_email.strip() or "@" not in customer_email:
            errors.append("Valid customer email is required.")
        if not st.session_state.selected_slot:
            errors.append("Please select an available parking slot.")
        selected_slot = slot_by_code(st.session_state.selected_slot) if st.session_state.selected_slot else None
        if selected_slot and selected_slot["status"] != "available":
            errors.append("Selected slot is not available.")

        if errors:
            for error in errors:
                st.error(error)
            return

        st.session_state.booking_data = {
            "vehicle_number": vehicle_number.strip(),
            "date": booking_date,
            "time": booking_time,
            "duration": int(duration_hours),
            "customer_name": customer_name.strip(),
            "customer_email": customer_email.strip(),
        }
        st.session_state.payment_method = "upi" if payment_method == "UPI" else "card"
        st.session_state.selected_tab = "Booking Confirmation"
        st.rerun()


def create_booking_from_form() -> dict:
    slot = slot_by_code(st.session_state.selected_slot)
    form = st.session_state.booking_data
    zone = get_zone(slot["zone"])
    return {
        "id": make_booking_id(),
        "zone": zone["id"],
        "slot": slot["code"],
        "slotCode": slot["code"],
        "date": str(form["date"]),
        "time": form["time"].strftime("%H:%M"),
        "duration": int(form["duration"]),
        "amount": zone["rate"] * int(form["duration"]),
        "price": zone["rate"] * int(form["duration"]),
        "status": "Confirmed",
        "createdAt": datetime.now().isoformat(),
        "customerName": form["customer_name"],
        "customerEmail": form["customer_email"],
        "userEmail": form["customer_email"],
        "vehicle": form["vehicle_number"],
        "paymentMethod": st.session_state.payment_method,
        "paid": True,
        "qrPayload": "",
        "checkInAt": None,
        "finalAmount": None,
    }


def render_booking_confirmation() -> None:
    st.markdown("### Booking confirmation")
    if not st.session_state.selected_slot:
        st.info("Select a slot from Find & Book to continue.")
        return

    slot = slot_by_code(st.session_state.selected_slot)
    if not slot:
        st.error("Selected slot could not be found.")
        return

    zone = get_zone(slot["zone"])
    amount = zone["rate"] * int(st.session_state.booking_data.get("duration", 2))

    st.markdown(
        f"""
        <div class="park-card">
          <div class="park-zone-header">
            <div>
              <div class="park-zone-name">{slot['code']} · {zone['name']}</div>
              <div class="park-zone-meta">{st.session_state.booking_data.get('vehicle_number', '')} · {st.session_state.booking_data.get('customer_email', '')}</div>
            </div>
            <div class="park-zone-meta">DEMO payment</div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.write({
        "Slot": slot["code"],
        "Zone": zone["name"],
        "Date": st.session_state.booking_data.get("date"),
        "Time": st.session_state.booking_data.get("time").strftime("%H:%M") if st.session_state.booking_data.get("time") else "",
        "Duration": f"{st.session_state.booking_data.get('duration', 2)} hours",
        "Amount": money(amount),
        "Payment": "DEMO payment only",
    })

    c1, c2 = st.columns(2)
    with c1:
        if st.button("Confirm booking and generate ticket"):
            booking = create_booking_from_form()
            booking["qrPayload"] = json.dumps(
                {
                    "id": booking["id"],
                    "zone": booking["zone"],
                    "slot": booking["slot"],
                    "date": booking["date"],
                    "time": booking["time"],
                    "duration": booking["duration"],
                    "amount": booking["amount"],
                    "customer": booking["customerEmail"],
                }
            )
            st.session_state.bookings.insert(0, booking)
            slot["status"] = "reserved"
            st.session_state.ticket_booking_id = booking["id"]
            sync_open_bookings_to_slots()
            st.session_state.selected_tab = "My Bookings"
            st.success("Booking confirmed. Ticket generated.")
            st.rerun()
    with c2:
        if st.button("Back to booking form"):
            st.session_state.selected_tab = "Find & Book"
            st.rerun()

    st.caption("Payment is a frontend demo flow only. No real transaction is processed.")


def render_ticket(booking: dict) -> None:
    zone = get_zone(booking["zone"])
    st.markdown("### Parking ticket")
    st.markdown(
        f"""
        <div class="park-ticket">
          <div class="park-brand"><div class="park-badge">P</div>ParkEase</div>
          <div class="park-divider"></div>
          <div class="park-ticket-grid">
            <div class="park-ticket-row"><span>Booking ID</span><b>{booking['id']}</b></div>
            <div class="park-ticket-row"><span>Zone</span><b>{zone['name']}</b></div>
            <div class="park-ticket-row"><span>Slot</span><b>{booking['slot']}</b></div>
            <div class="park-ticket-row"><span>Amount</span><b>{money(booking_amount(booking))}</b></div>
            <div class="park-ticket-row"><span>Date</span><b>{booking['date']}</b></div>
            <div class="park-ticket-row"><span>Time</span><b>{booking['time']} · {booking['duration']}h</b></div>
            <div class="park-ticket-row"><span>Customer</span><b>{booking['customerName']}</b></div>
            <div class="park-ticket-row"><span>Status</span><b>{booking_status_label(booking['status'])}</b></div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    components.html(create_qr_html(booking["qrPayload"]), height=220, scrolling=False)
    c1, c2 = st.columns(2)
    with c1:
        st.download_button(
            "Download ticket data",
            data=json.dumps(booking, indent=2),
            file_name=f"{booking['id']}.json",
            mime="application/json",
        )
    with c2:
        st.caption("Use the QR code above for ticket lookup. Print is handled by the browser when needed.")


def render_my_bookings() -> None:
    st.markdown("### My Bookings")
    current = st.session_state.get("current_user")
    if not current:
        st.info("Sign in as a driver or admin to view saved bookings.")
        return

    bookings = user_bookings()
    if not bookings:
        st.info("No bookings yet.")
        return

    for booking in bookings:
        zone = get_zone(booking["zone"])
        with st.container(border=True):
            cols = st.columns([1.4, 1, 1, 1])
            cols[0].markdown(f"**{booking['slot']}**  \n{zone['name']}  \n`{booking['id']}`")
            cols[1].write(f"{booking['date']}\n\n{booking['time']}")
            cols[2].write(f"{booking['duration']} h\n\n{money(booking_amount(booking))}")
            cols[3].markdown(f"<span class='{booking_status_class(booking['status'])}'>{booking_status_label(booking['status'])}</span>", unsafe_allow_html=True)

            action_cols = st.columns(4)
            if booking["status"] == "Confirmed":
                with action_cols[0]:
                    if st.button("Start parking", key=f"checkin-{booking['id']}"):
                        booking["status"] = "Active"
                        booking["checkInAt"] = datetime.now().isoformat()
                        sync_open_bookings_to_slots()
                        st.success("Checked in.")
                        st.rerun()
                with action_cols[1]:
                    if st.button("Cancel booking", key=f"cancel-{booking['id']}"):
                        booking["status"] = "Cancelled"
                        slot = slot_by_code(booking_slot_code(booking))
                        if slot:
                            slot["status"] = "available"
                        st.success("Booking cancelled.")
                        st.rerun()
                with action_cols[2]:
                    if st.button("View ticket", key=f"view-ticket-{booking['id']}"):
                        st.session_state.ticket_booking_id = booking["id"]
                        st.rerun()
            elif booking["status"] == "Active":
                with action_cols[0]:
                    if st.button("End & pay", key=f"checkout-{booking['id']}"):
                        booking["status"] = "Completed"
                        zone_rate = get_zone(booking["zone"])["rate"]
                        booking["finalAmount"] = min(zone_rate * booking["duration"], zone_rate * booking["duration"])
                        slot = slot_by_code(booking_slot_code(booking))
                        if slot:
                            slot["status"] = "available"
                        st.success("Session completed.")
                        st.rerun()
            else:
                st.caption("Completed and cancelled bookings remain in history.")


def render_admin() -> None:
    st.markdown("### Admin section")
    current = st.session_state.get("current_user")
    if not current or current.get("role") != "Admin":
        st.warning("Admin access required.")
        return

    total_bookings = len(st.session_state.bookings)
    confirmed = sum(1 for booking in st.session_state.bookings if booking["status"] != "Cancelled")
    available_slots = sum(1 for slot in st.session_state.slots if slot["status"] == "available")
    booked_slots = sum(1 for slot in st.session_state.slots if slot["status"] in {"occupied", "reserved"})
    revenue = sum(booking_amount(booking) for booking in st.session_state.bookings if booking["status"] != "Cancelled")

    cols = st.columns(4)
    metrics = [
        (cols[0], total_bookings, "Total bookings"),
        (cols[1], confirmed, "Confirmed bookings"),
        (cols[2], available_slots, "Available slots"),
        (cols[3], booked_slots, "Booked slots"),
    ]
    for col, value, label in metrics:
        with col:
            st.markdown(f"<div class='park-kpi'><div class='park-kpi-value'>{value}</div><div class='park-kpi-label'>{label}</div></div>", unsafe_allow_html=True)

    st.markdown(f"**Collected revenue:** {money(revenue)}")
    st.caption("UPI and card payments are demo-only and tracked from booking records in session state.")

    st.markdown("#### Recent bookings")
    for booking in st.session_state.bookings[:10]:
        zone = get_zone(booking["zone"])
        with st.container(border=True):
            c1, c2, c3, c4 = st.columns([1.3, 1, 1, 1])
            c1.write(f"{booking['id']}\n\n{booking['slot']} · {zone['name']}")
            c2.write(booking.get("customerEmail") or "—")
            c3.write(booking.get("paymentMethod", "—").upper())
            c4.write(f"{money(booking_amount(booking))}\n\n{booking_status_label(booking['status'])}")

            if booking["status"] in {"Confirmed", "Active"}:
                action_cols = st.columns(3)
                with action_cols[0]:
                    if st.button("Force cancel", key=f"admin-cancel-{booking['id']}"):
                        booking["status"] = "Cancelled"
                        slot = slot_by_code(booking_slot_code(booking))
                        if slot:
                            slot["status"] = "available"
                        st.rerun()
                with action_cols[1]:
                    if st.button("Mark completed", key=f"admin-complete-{booking['id']}"):
                        booking["status"] = "Completed"
                        slot = slot_by_code(booking_slot_code(booking))
                        if slot:
                            slot["status"] = "available"
                        st.rerun()

    st.markdown("#### Slot controls")
    for zone in ZONES:
        with st.expander(zone["name"], expanded=False):
            zone_slots = [slot for slot in st.session_state.slots if slot["zone"] == zone["id"]]
            slot_cols = st.columns(4)
            for index, slot in enumerate(zone_slots):
                with slot_cols[index % 4]:
                    st.write(f"**{slot['code']}**")
                    st.caption(f"{slot['type']} · {slot['status']}")
                    if slot["status"] == "maintenance":
                        if st.button("Set available", key=f"avail-{slot['code']}"):
                            slot["status"] = "available"
                            st.rerun()
                    elif slot["status"] == "available":
                        if st.button("Mark maintenance", key=f"maint-{slot['code']}"):
                            slot["status"] = "maintenance"
                            st.rerun()
                    else:
                        if st.button("Force free", key=f"free-{slot['code']}"):
                            slot["status"] = "available"
                            for booking in st.session_state.bookings:
                                if booking_slot_code(booking) == slot["code"] and booking["status"] in {"Confirmed", "Active"}:
                                    booking["status"] = "Cancelled"
                            st.rerun()


def render_navigation() -> None:
    tabs = st.tabs(["Home", "Find & Book", "My Bookings", "Booking Confirmation", "Admin"])
    with tabs[0]:
        render_home()
    with tabs[1]:
        render_find_book()
    with tabs[2]:
        render_my_bookings()
    with tabs[3]:
        render_booking_confirmation()
    with tabs[4]:
        render_admin()


def render_auth_panel() -> None:
    with st.sidebar:
        st.markdown("### ParkEase")
        st.caption("Smart Parking Management & Slot Booking")
        current = st.session_state.get("current_user")
        if current:
            st.success(f"Signed in as {current['name']} ({current['role']})")
            if st.button("Sign out"):
                st.session_state.current_user = None
                st.session_state.auth_message = "Signed out."
                st.rerun()
        else:
            mode = st.radio("Account", ["Sign in", "Create account"], horizontal=True)
            with st.form("auth_form"):
                name = st.text_input("Full name") if mode == "Create account" else None
                email = st.text_input("Email")
                password = st.text_input("Password", type="password")
                submitted = st.form_submit_button(mode)

            if submitted:
                users = st.session_state.users
                if mode == "Sign in":
                    user = next((user for user in users if user["email"].lower() == email.strip().lower() and user["password"] == password), None)
                    if user:
                        st.session_state.current_user = {"name": user["name"], "email": user["email"], "role": user["role"]}
                        st.session_state.auth_message = f"Signed in as {user['name']}"
                        st.rerun()
                    else:
                        st.error("No account matches those details.")
                else:
                    if not name or not email or not password:
                        st.error("All fields are required.")
                    elif len(password) < 6:
                        st.error("Password must be at least 6 characters.")
                    elif any(user["email"].lower() == email.strip().lower() for user in users):
                        st.error("An account with this email already exists.")
                    else:
                        role = "Admin" if email.strip().lower() == ADMIN_EMAIL.lower() else "Driver"
                        user = {"name": name.strip(), "email": email.strip(), "password": password, "role": role}
                        st.session_state.users.append(user)
                        st.session_state.current_user = {"name": user["name"], "email": user["email"], "role": user["role"]}
                        st.success("Account created.")
                        st.rerun()


def main() -> None:
    st.set_page_config(page_title=APP_TITLE, page_icon="🅿️", layout="wide")
    init_state()
    sync_open_bookings_to_slots()
    add_base_css()
    render_auth_panel()
    render_header()

    if st.session_state.ticket_booking_id:
        booking = next((item for item in st.session_state.bookings if item["id"] == st.session_state.ticket_booking_id), None)
        if booking:
            st.markdown("### Generated ticket")
            render_ticket(booking)
            if st.button("Close ticket view"):
                st.session_state.ticket_booking_id = None
                st.rerun()

    render_navigation()


if __name__ == "__main__":
    main()