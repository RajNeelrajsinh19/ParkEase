/* ===================== CONFIG ===================== */
const STORAGE_KEYS = {
  bookings: 'parkease_bookings',
  slots: 'parkease_slots',
  users: 'parkease_users',
  session: 'parkease_session',
  adminSession: 'parkease_admin_session'
};
const ADMIN_EMAIL = 'neelrajsinhraj2006@gmail.com';
const ADMIN_PASSWORD = 'Admin@123';
const PAYEE_PHONE = '8320066092';
const PAYEE_VPA = PAYEE_PHONE + '@upi';
const PAYEE_NAME = 'ParkEase';

/* ===================== STATE ===================== */
const ZONES = [
  {id:'A', name:'Zone A · Ground Floor', type:'Car', rate:30, count:12},
  {id:'B', name:'Zone B · Level 1', type:'Car', rate:25, count:12},
  {id:'C', name:'Zone C · EV Charging', type:'EV', rate:50, count:6},
  {id:'D', name:'Zone D · Two-Wheeler', type:'Bike', rate:15, count:10},
];
const DEFAULT_USERS = [
  {name: 'Neel Rajsinh', email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'Admin'}
];
const SEED_ZONE_STATUS = {
  A: {occupied:[0,3,6,9], maintenance:[]},
  B: {occupied:[1,2,7], maintenance:[8]},
  C: {occupied:[0,4], maintenance:[]},
  D: {occupied:[1,3,5,6,8], maintenance:[]}
};
let slots = [];
let users = [];
let bookings = [];
let currentUser = null;
let loginTab = 'signin';
let activeZone = 'A';
let activeTypeFilter = 'all';
let pendingSlotCode = null;
let pendingBookingDraft = null;
let selectedPayMethod = 'upi';
let selectedSlotCode = null;

/* ===================== HELPERS ===================== */
function storageRead(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(raw === null || raw === '') return fallback;
    return JSON.parse(raw);
  }catch{
    return fallback;
  }
}
function storageWrite(key, value){
  try{
    localStorage.setItem(key, JSON.stringify(value));
  }catch{}
}
function storageRemove(key){
  try{ localStorage.removeItem(key); }catch{}
}
function zoneOf(id){ return ZONES.find(z=>z.id===id); }
function fmtMoney(n){ return '₹' + Math.round(Number(n || 0)); }
function isValidEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function isValidVehicleNumber(value){ return /^[A-Z0-9\s-]{4,16}$/i.test(value.trim()); }
function isValidDateValue(value){
  if(!value) return false;
  const selected = new Date(value + 'T00:00:00');
  selected.setHours(0,0,0,0);
  const today = new Date();
  today.setHours(0,0,0,0);
  return selected >= today;
}
function isValidTimeValue(value){ return /^\d{2}:\d{2}$/.test(value); }
function getLocalDateString(date = new Date()){
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function getLocalTimeString(date = new Date()){
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
function isValidCardNumber(value){
  const digits = value.replace(/\D/g, '');
  if(digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for(let i = digits.length - 1; i >= 0; i -= 1){
    let digit = Number(digits[i]);
    if(shouldDouble){
      digit *= 2;
      if(digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}
function parseMonthYear(value){
  const match = value.match(/^(\d{2})\/(\d{2})$/);
  if(!match) return null;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if(month < 1 || month > 12) return null;
  return {month, year};
}
function isFutureExpiry(value){
  const parsed = parseMonthYear(value);
  if(!parsed) return false;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return parsed.year > currentYear || (parsed.year === currentYear && parsed.month >= currentMonth);
}
function toast(msg, isErr){
  const wrap = document.getElementById('toastWrap');
  if(!wrap) return;
  while(wrap.children.length >= 3){ wrap.removeChild(wrap.firstElementChild); }
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' err' : '');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(()=>t.remove(), 3000);
}
function createDefaultSlots(){
  const list = [];
  ZONES.forEach(zone => {
    for(let index = 0; index < zone.count; index += 1){
      list.push({
        code: `${zone.id}-${String(index + 1).padStart(2, '0')}`,
        zone: zone.id,
        type: zone.type,
        status: 'available'
      });
    }
  });
  Object.entries(SEED_ZONE_STATUS).forEach(([zoneId, seed]) => {
    list.filter(slot => slot.zone === zoneId).forEach((slot, index) => {
      if(seed.maintenance.includes(index)) slot.status = 'maintenance';
      if(seed.occupied.includes(index)) slot.status = 'occupied';
    });
  });
  return list;
}
function normalizeSlot(slot, fallback){
  const allowed = ['available', 'reserved', 'occupied', 'maintenance'];
  return {
    code: slot?.code || fallback.code,
    zone: slot?.zone || fallback.zone,
    type: slot?.type || fallback.type,
    status: allowed.includes(slot?.status) ? slot.status : fallback.status
  };
}
function normalizeStatus(status){
  const map = {
    upcoming: 'Confirmed',
    confirmed: 'Confirmed',
    active: 'Active',
    completed: 'Completed',
    cancelled: 'Cancelled',
    canceled: 'Cancelled'
  };
  return map[String(status || '').toLowerCase()] || 'Confirmed';
}
function normalizeBooking(raw){
  if(!raw) return null;
  const slot = raw.slot || raw.slotCode || '';
  const amount = Number(raw.amount ?? raw.price ?? 0) || 0;
  return {
    id: raw.id || generateBookingId(),
    zone: raw.zone || (slot ? slot.split('-')[0] : 'A'),
    slot,
    slotCode: raw.slotCode || slot,
    date: raw.date || '',
    time: raw.time || '',
    duration: Number(raw.duration) > 0 ? Number(raw.duration) : 1,
    amount,
    price: Number(raw.price ?? amount) || amount,
    status: normalizeStatus(raw.status),
    createdAt: raw.createdAt || new Date().toISOString(),
    customerName: raw.customerName || raw.name || '',
    customerEmail: raw.customerEmail || raw.userEmail || '',
    userEmail: raw.userEmail || raw.customerEmail || '',
    vehicle: raw.vehicle || '',
    paymentMethod: raw.paymentMethod || 'upi',
    qrPayload: raw.qrPayload || '',
    checkInAt: raw.checkInAt || null,
    finalAmount: raw.finalAmount ?? null,
    warnedExpiry: Boolean(raw.warnedExpiry)
  };
}
function normalizeUser(raw){
  if(!raw || !raw.email) return null;
  return {
    name: raw.name || raw.email.split('@')[0],
    email: raw.email,
    password: raw.password || '',
    role: raw.role === 'Admin' ? 'Admin' : 'Driver'
  };
}
function loadSlots(){
  const defaults = createDefaultSlots();
  const stored = storageRead(STORAGE_KEYS.slots, null);
  if(!Array.isArray(stored) || stored.length === 0) return defaults;
  return defaults.map(def => normalizeSlot(stored.find(slot => slot && slot.code === def.code), def));
}
function loadUsers(){
  const stored = storageRead(STORAGE_KEYS.users, null);
  const list = Array.isArray(stored) ? stored.map(normalizeUser).filter(Boolean) : DEFAULT_USERS.map(user => ({...user}));
  if(!list.some(user => user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase())){
    list.unshift({...DEFAULT_USERS[0]});
  }
  return list;
}
function loadBookings(){
  const stored = storageRead(STORAGE_KEYS.bookings, []);
  return Array.isArray(stored) ? stored.map(normalizeBooking).filter(Boolean) : [];
}
function loadSession(){
  const session = storageRead(STORAGE_KEYS.session, null) || storageRead(STORAGE_KEYS.adminSession, null);
  if(!session || !session.email) return null;
  const storedUser = users.find(user => user.email.toLowerCase() === session.email.toLowerCase());
  if(storedUser){
    return {name: storedUser.name, email: storedUser.email, role: storedUser.role};
  }
  return {
    name: session.name || session.email.split('@')[0],
    email: session.email,
    role: session.role === 'Admin' ? 'Admin' : 'Driver'
  };
}
function persistUsers(){ storageWrite(STORAGE_KEYS.users, users); }
function persistSlots(){ storageWrite(STORAGE_KEYS.slots, slots); }
function persistBookings(){ storageWrite(STORAGE_KEYS.bookings, bookings); }
function persistSession(){
  if(currentUser){
    storageWrite(STORAGE_KEYS.session, currentUser);
    if(currentUser.role === 'Admin') storageWrite(STORAGE_KEYS.adminSession, currentUser);
    else storageRemove(STORAGE_KEYS.adminSession);
  } else {
    storageRemove(STORAGE_KEYS.session);
    storageRemove(STORAGE_KEYS.adminSession);
  }
}
function persistAll(){
  persistUsers();
  persistSlots();
  persistBookings();
  persistSession();
}
function bookingSlotCode(booking){ return booking?.slot || booking?.slotCode || ''; }
function findSlot(code){ return slots.find(slot => slot.code === code); }
function getBookingAmount(booking){ return Number(booking?.finalAmount ?? booking?.amount ?? booking?.price ?? 0) || 0; }
function generateBookingId(){
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PE-${time}-${rand}`;
}
function buildUpiUri(amount, note){
  const params = new URLSearchParams({
    pa: PAYEE_VPA,
    pn: PAYEE_NAME,
    am: String(Number(amount || 0).toFixed(2)),
    cu: 'INR',
    tn: note
  });
  return 'upi://pay?' + params.toString();
}
function qrHtml(seedStr){
  let hash = 0;
  for(let index = 0; index < seedStr.length; index += 1){ hash = (hash * 31 + seedStr.charCodeAt(index)) >>> 0; }
  let cells = '';
  for(let index = 0; index < 64; index += 1){
    hash = (hash * 1103515245 + 12345) >>> 0;
    const on = (hash >> 16) % 2 === 0;
    cells += '<div class="' + (on ? '' : 'off') + '"></div>';
  }
  return cells;
}
function closeOverlay(id){
  const overlay = document.getElementById(id);
  if(overlay) overlay.remove();
}
function closeAnyOverlay(){
  document.querySelectorAll('.overlay').forEach(overlay => overlay.remove());
}
function slotStatusLabel(status){
  const map = {available:'Available', reserved:'Booked', occupied:'Booked', maintenance:'Unavailable'};
  return map[status] || 'Available';
}
function bookingStatusClass(status){
  const map = {Confirmed:'status-upcoming', Active:'status-active', Completed:'status-completed', Cancelled:'status-cancelled'};
  return map[status] || 'status-upcoming';
}
function bookingStatusLabel(status){
  return status || 'Confirmed';
}
function bookingIsOpen(booking){
  return booking && (booking.status === 'Confirmed' || booking.status === 'Active');
}
function refreshSlotStateFromBookings(){
  slots = slots.map(slot => {
    const activeBooking = bookings.find(booking => bookingIsOpen(booking) && bookingSlotCode(booking) === slot.code);
    if(!activeBooking || slot.status === 'maintenance') return slot;
    return {...slot, status: activeBooking.status === 'Active' ? 'occupied' : 'reserved'};
  });
}
function updateSelectedSlot(code){
  selectedSlotCode = code || null;
}

users = loadUsers();
slots = loadSlots();
bookings = loadBookings();
refreshSlotStateFromBookings();
currentUser = loadSession();

/* ===================== NAV ===================== */
document.querySelectorAll('[data-nav]').forEach(btn=>{
  btn.addEventListener('click', ()=> goTo(btn.getAttribute('data-nav')));
});
function goTo(view){
  if(view==='admin' && (!currentUser || currentUser.role!=='Admin')){
    toast('Admin dashboard is restricted to the verified operator account.', true);
    openLogin();
    return;
  }
  document.querySelectorAll('[id^="view-"]').forEach(v=>v.classList.add('hidden'));
  document.getElementById('view-'+view).classList.remove('hidden');
  document.querySelectorAll('.navlink').forEach(b=>b.classList.remove('active'));
  const navBtn = document.querySelector('.navlink[data-nav="'+view+'"]');
  if(navBtn) navBtn.classList.add('active');
  document.getElementById('navLinks').classList.remove('mobile-open');
  if(view==='book') renderBookSection();
  if(view==='bookings') renderBookings();
  if(view==='admin') renderAdmin();
  window.scrollTo({top:0});
}
document.getElementById('hamburgerBtn').addEventListener('click', ()=>{
  document.getElementById('navLinks').classList.toggle('mobile-open');
});

/* ===================== HOME ===================== */
function renderHome(){
  const total = slots.length;
  const occ = slots.filter(s=>s.status==='occupied'||s.status==='reserved').length;
  const avail = slots.filter(s=>s.status==='available').length;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statAvail').textContent = avail;
  document.getElementById('statOcc').textContent = occ;
  document.getElementById('statPct').textContent = Math.round(occ/total*100)+'%';

  const zoneASlots = slots.filter(s=>s.zone==='A');
  const half = Math.ceil(zoneASlots.length/2);
  const g1 = document.getElementById('miniGrid');
  const g2 = document.getElementById('miniGrid2');
  g1.innerHTML=''; g2.innerHTML='';
  zoneASlots.forEach((s,i)=>{
    const d = document.createElement('div');
    d.className = 'mini-slot'+(s.status!=='available'?' occ':'');
    d.textContent = s.status==='available' ? 'P' : '✕';
    (i<half?g1:g2).appendChild(d);
  });
}
/* ===================== BOOK SECTION ===================== */
function renderZoneTabs(){
  const holder = document.getElementById('zoneTabsHolder');
  holder.innerHTML='';
  ZONES.forEach(z=>{
    const b = document.createElement('button');
    b.className = 'zone-tab'+(z.id===activeZone?' active':'');
    b.innerHTML = z.name.split('·')[0].trim() + '<span class="zt-rate">₹'+z.rate+'/hr</span>';
    b.addEventListener('click', ()=>{ activeZone=z.id; renderBookSection(); });
    holder.appendChild(b);
  });
}
document.querySelectorAll('#typeChipsHolder .chip').forEach(c=>{
  c.addEventListener('click', ()=>{
    document.querySelectorAll('#typeChipsHolder .chip').forEach(x=>x.classList.remove('active'));
    c.classList.add('active');
    activeTypeFilter = c.getAttribute('data-type');
    renderBookSection();
  });
});
function renderBookSection(){
  const noticeEl = document.getElementById('bookNotice');
  if(!currentUser){
    noticeEl.innerHTML = `<div class="notice">🔒 Sign in with your email to reserve a slot. Your bookings stay linked to your account.</div>`;
  } else if(currentUser.role==='Admin'){
    noticeEl.innerHTML = `<div class="notice admin-block">You're signed in as the admin account. Switch to a driver account to make a booking.</div>`;
  } else {
    noticeEl.innerHTML='';
  }
  renderZoneTabs();
  const zone = zoneOf(activeZone);
  document.getElementById('zoneCaptionTitle').textContent = zone.name;
  document.getElementById('zoneCaptionRate').textContent = '₹'+zone.rate+'/hr';
  const grid = document.getElementById('slotGrid');
  grid.innerHTML='';
  let zoneSlots = slots.filter(s=>s.zone===activeZone);
  if(activeTypeFilter!=='all') zoneSlots = zoneSlots.filter(s=>s.type===activeTypeFilter);
  const availableHere = zoneSlots.filter(s=>s.status==='available').length;
  if(availableHere===0){
    const alt = ZONES.filter(z=>z.id!==activeZone).map(z=>{
      let zs = slots.filter(s=>s.zone===z.id);
      if(activeTypeFilter!=='all') zs = zs.filter(s=>s.type===activeTypeFilter);
      return {zone:z, open: zs.filter(s=>s.status==='available').length};
    }).filter(a=>a.open>0).sort((a,b)=>b.open-a.open)[0];
    if(alt){
      noticeEl.innerHTML += `<div class="notice" style="margin-top:${currentUser&&currentUser.role!=='Admin'?'0':'10px'}">🅿️ No open spots here right now. <b style="margin:0 6px;">${alt.zone.name.split('·')[0].trim()}</b> has ${alt.open} open — <button class="tiny-btn" id="switchZoneSuggestBtn" data-zone="${alt.zone.id}" style="margin-left:6px;">Switch there</button></div>`;
    }
  }
  if(zoneSlots.length===0){
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No slots match this filter in this zone.</div>';
    return;
  }
  zoneSlots.forEach(s=>{
    const el = document.createElement('div');
    el.className = 'slot '+s.status+(s.type==='EV'?' ev':'')+(selectedSlotCode===s.code?' selected':'');
    el.innerHTML = '<span class="code">'+s.code+'</span><span class="stat">'+slotStatusLabel(s.status)+'</span>';
    if(s.status==='available'){
      el.addEventListener('click', ()=> handleSlotClick(s));
    }
    grid.appendChild(el);
  });
  const suggestBtn = document.getElementById('switchZoneSuggestBtn');
  if(suggestBtn){
    suggestBtn.addEventListener('click', ()=>{ activeZone = suggestBtn.getAttribute('data-zone'); renderBookSection(); });
  }
}
function handleSlotClick(slot){
  if(!currentUser){
    toast('Please sign in first to book a slot.', true);
    openLogin();
    return;
  }
  if(currentUser.role==='Admin'){
    toast('Admin account cannot make bookings.', true);
    return;
  }
  openBookingModal(slot);
}

/* ===================== BOOKING MODAL -> PAYMENT -> TICKET ===================== */
function openBookingModal(slot){
  pendingSlotCode = slot.code;
  updateSelectedSlot(slot.code);
  const zone = zoneOf(slot.zone);
  const today = getLocalDateString();
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'bookingOverlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Reserve ${slot.code}</h3><button class="close-x" id="closeModalBtn">✕</button></div>
      <div class="modal-sub">${zone.name} · ₹${zone.rate}/hr · ${slot.type}</div>
      <div class="pay-summary">
        <div class="pr"><span>Selected slot</span><b>${slot.code}</b></div>
        <div class="pr"><span>Zone</span><b>${zone.name.split('·')[0].trim()}</b></div>
        <div class="pr"><span>Customer</span><b>${currentUser ? currentUser.name : 'Guest'}</b></div>
      </div>
      <div class="form-row">
        <label>Vehicle number</label>
        <input type="text" id="fVehicle" placeholder="e.g. GJ06 AB 1234" maxlength="14">
        <div class="err" id="errVehicle">Enter a valid vehicle number.</div>
      </div>
      <div class="form-grid2">
        <div class="form-row"><label>Date</label><input type="date" id="fDate" min="${today}" value="${today}"></div>
        <div class="form-row"><label>Start time</label><input type="time" id="fTime" value="${getLocalTimeString()}"></div>
      </div>
      <div class="form-row">
        <label>Duration</label>
        <div class="dur-row">
          <input type="range" id="fDuration" min="1" max="8" value="2" step="1">
          <span class="dur-val" id="durVal">2 hrs</span>
        </div>
      </div>
      <div class="price-box">
        <span style="color:var(--text-dim);font-size:13px;">Amount payable</span>
        <b id="priceVal">₹${zone.rate*2}</b>
      </div>
      <div class="err" id="errBooking">Please complete all booking details.</div>
      <button class="btn btn-primary" style="width:100%;" id="proceedPayBtn">Proceed to payment →</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('closeModalBtn').addEventListener('click', ()=>{ closeOverlay('bookingOverlay'); pendingSlotCode = null; });
  overlay.addEventListener('click', e=>{ if(e.target===overlay){ closeOverlay('bookingOverlay'); pendingSlotCode = null; } });
  document.getElementById('fDuration').addEventListener('input', updatePrice);
  document.getElementById('fDate').addEventListener('change', updatePrice);
  document.getElementById('fTime').addEventListener('change', updatePrice);
  document.getElementById('fVehicle').addEventListener('input', ()=>{ document.getElementById('errVehicle').style.display='none'; });
  document.getElementById('proceedPayBtn').addEventListener('click', proceedToPayment);
  function updatePrice(){
    const d = document.getElementById('fDuration').value;
    document.getElementById('durVal').textContent = d+' hr'+(d>1?'s':'');
    document.getElementById('priceVal').textContent = fmtMoney(zone.rate*d);
  }
}
function proceedToPayment(){
  const vehicle = document.getElementById('fVehicle').value.trim();
  const date = document.getElementById('fDate').value;
  const time = document.getElementById('fTime').value;
  const duration = parseInt(document.getElementById('fDuration').value,10);
  const errVehicle = document.getElementById('errVehicle');
  const errBooking = document.getElementById('errBooking');
  errVehicle.style.display='none';
  errBooking.style.display='none';
  if(!isValidVehicleNumber(vehicle)){
    errVehicle.style.display='block';
    return;
  }
  if(!isValidDateValue(date) || !isValidTimeValue(time) || Number.isNaN(duration) || duration < 1 || duration > 8){
    errBooking.textContent = 'Enter a valid date, time, and duration.';
    errBooking.style.display='block';
    return;
  }
  const selectedDateTime = new Date(`${date}T${time}:00`);
  if(Number.isNaN(selectedDateTime.getTime())){
    errBooking.textContent = 'Enter a valid date and time.';
    errBooking.style.display='block';
    return;
  }
  const now = new Date();
  if(selectedDateTime < now && date === now.toISOString().split('T')[0]){
    errBooking.textContent = 'Entry time cannot be in the past.';
    errBooking.style.display='block';
    return;
  }
  const zone = zoneOf(pendingSlotCode ? pendingSlotCode.split('-')[0] : activeZone);
  const slot = pendingSlotCode ? findSlot(pendingSlotCode) : null;
  if(!slot || slot.status !== 'available'){
    errBooking.textContent = 'That slot is no longer available. Please choose another one.';
    errBooking.style.display='block';
    return;
  }
  const conflict = bookings.some(booking => bookingSlotCode(booking) === slot.code && bookingIsOpen(booking));
  if(conflict){
    errBooking.textContent = 'That slot is already booked. Select another slot.';
    errBooking.style.display='block';
    return;
  }
  const price = zone.rate * duration;
  pendingBookingDraft = {
    slotCode: slot.code,
    slot: slot.code,
    zone: zone.id,
    vehicle,
    date,
    time,
    duration,
    amount: price,
    customerName: currentUser ? currentUser.name : '',
    customerEmail: currentUser ? currentUser.email : ''
  };
  closeOverlay('bookingOverlay');
  openPaymentModal();
}
function openPaymentModal(){
  selectedPayMethod = 'upi';
  const d = pendingBookingDraft;
  const zone = zoneOf(d.zone);
  if(!d){
    toast('Booking details were not captured correctly.', true);
    return;
  }
  const overlay = document.createElement('div');
  overlay.className='overlay';
  overlay.id='paymentOverlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Payment</h3><button class="close-x" id="closePayBtn">✕</button></div>
      <div class="modal-sub">Reservation is confirmed only after payment succeeds.</div>
      <div class="pay-summary">
        <div class="pr"><span>Slot</span><b>${d.slotCode} · ${zone.name.split('·')[0].trim()}</b></div>
        <div class="pr"><span>Zone</span><b>${zone.name}</b></div>
        <div class="pr"><span>Duration</span><b>${d.duration} hr${d.duration>1?'s':''}</b></div>
        <div class="pr"><span>Vehicle</span><b>${d.vehicle}</b></div>
        <div class="pr total"><span>Total</span><b>${fmtMoney(d.amount)}</b></div>
      </div>
      <div class="pay-methods">
        <div class="pay-method sel" id="payUpi">📱 UPI</div>
        <div class="pay-method" id="payCard">💳 Card</div>
      </div>
      <div id="payFieldsUpi">
        <div class="upi-real-box">
          <div class="qr-upi" id="upiQr"></div>
          <div class="upi-pay-to">Paying to <b>+91 ${PAYEE_PHONE}</b> · ${PAYEE_NAME}</div>
          <div class="upi-hint">Scan the QR with any UPI app (Google Pay, PhonePe, Paytm). This demo does not submit a real banking transaction.</div>
        </div>
      </div>
      <div id="payFieldsCard" class="hidden">
        <div class="card-demo-note">Card payments are simulated for this demo — real card processing needs a licensed payment gateway connected to a backend server.</div>
        <div class="form-row"><label>Card number</label><input type="text" id="fCard" placeholder="1234 5678 9012 3456" maxlength="19"></div>
        <div class="form-grid2">
          <div class="form-row"><label>Expiry</label><input type="text" id="fExp" placeholder="MM/YY" maxlength="5"></div>
          <div class="form-row"><label>CVV</label><input type="text" id="fCvv" placeholder="•••" maxlength="3"></div>
        </div>
      </div>
      <div class="err" id="errPay">Enter valid card details to continue.</div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px;" id="payNowBtn">Pay ${fmtMoney(d.amount)} now</button>
      <div class="pay-lock">🔒 Demo payment only · no real banking transaction is initiated.</div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('closePayBtn').addEventListener('click', ()=>{ closeOverlay('paymentOverlay'); pendingBookingDraft = null; pendingSlotCode = null; updateSelectedSlot(null); renderBookSection(); });
  overlay.addEventListener('click', e=>{ if(e.target===overlay){ closeOverlay('paymentOverlay'); pendingBookingDraft = null; pendingSlotCode = null; updateSelectedSlot(null); renderBookSection(); } });
  document.getElementById('payUpi').addEventListener('click', ()=>switchPayMethod('upi'));
  document.getElementById('payCard').addEventListener('click', ()=>switchPayMethod('card'));
  document.getElementById('payNowBtn').addEventListener('click', submitPayment);

  const upiUri = buildUpiUri(d.amount, 'ParkEase '+d.slotCode);
  const qrBox = document.getElementById('upiQr');
  try{
    if(window.QRCode){
      qrBox.innerHTML = '';
      new QRCode(qrBox, { text: upiUri, width: 134, height: 134, correctLevel: QRCode.CorrectLevel.M });
    } else {
      qrBox.innerHTML = '<span style="color:#666;font-size:11px;padding:8px;">QR unavailable offline</span>';
    }
  }catch{
    qrBox.innerHTML = '<span style="color:#666;font-size:11px;padding:8px;">QR unavailable offline</span>';
  }
  overlay.dataset.upiUri = upiUri;
}
function switchPayMethod(m){
  selectedPayMethod = m;
  document.getElementById('payUpi').classList.toggle('sel', m==='upi');
  document.getElementById('payCard').classList.toggle('sel', m==='card');
  document.getElementById('payFieldsUpi').classList.toggle('hidden', m!=='upi');
  document.getElementById('payFieldsCard').classList.toggle('hidden', m!=='card');
  document.getElementById('errPay').style.display='none';
  const btn = document.getElementById('payNowBtn');
  const d = pendingBookingDraft;
  btn.textContent = 'Pay '+fmtMoney(d.amount)+' now';
}
function submitPayment(){
  const errEl = document.getElementById('errPay');
  errEl.style.display='none';
  let valid = true;
  if(selectedPayMethod==='card'){
    const card = document.getElementById('fCard').value.replace(/\s/g,'');
    const exp = document.getElementById('fExp').value.trim();
    const cvv = document.getElementById('fCvv').value.trim();
    valid = isValidCardNumber(card) && /^\d{2}\/\d{2}$/.test(exp) && isFutureExpiry(exp) && /^\d{3}$/.test(cvv);
    errEl.textContent = 'Enter valid card details to continue.';
  }
  if(!valid){ errEl.style.display='block'; return; }

  const btn = document.getElementById('payNowBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Completing demo payment…';
  setTimeout(()=>{
    finalizeBooking();
  }, 1300);
}
function finalizeBooking(){
  const d = pendingBookingDraft;
  if(!d){
    toast('Booking draft is missing.', true);
    return;
  }
  const slot = findSlot(d.slotCode);
  if(!slot || slot.status !== 'available'){
    closeOverlay('paymentOverlay');
    pendingBookingDraft = null;
    pendingSlotCode = null;
    updateSelectedSlot(null);
    renderBookSection();
    toast('That slot is no longer available.', true);
    return;
  }
  const conflict = bookings.some(booking => bookingSlotCode(booking) === d.slotCode && bookingIsOpen(booking));
  if(conflict){
    closeOverlay('paymentOverlay');
    pendingBookingDraft = null;
    pendingSlotCode = null;
    updateSelectedSlot(null);
    renderBookSection();
    toast('That slot has already been booked.', true);
    return;
  }
  const id = generateBookingId();
  const booking = {
    id,
    zone:d.zone,
    slot:d.slotCode,
    slotCode:d.slotCode,
    vehicle:d.vehicle,
    date:d.date,
    time:d.time,
    duration:d.duration,
    amount:d.amount,
    price:d.amount,
    status:'Confirmed',
    checkInAt:null,
    createdAt:new Date().toISOString(),
    paymentMethod:selectedPayMethod,
    paid:true,
    customerName: currentUser ? currentUser.name : '',
    customerEmail: currentUser ? currentUser.email : '',
    userEmail: currentUser ? currentUser.email : '',
    qrPayload: ''
  };
  booking.qrPayload = JSON.stringify({
    id: booking.id,
    zone: booking.zone,
    slot: booking.slotCode,
    date: booking.date,
    time: booking.time,
    duration: booking.duration,
    amount: booking.amount,
    customer: booking.customerEmail
  });
  bookings.unshift(booking);
  slot.status = 'reserved';
  closeOverlay('paymentOverlay');
  pendingBookingDraft = null;
  pendingSlotCode = null;
  updateSelectedSlot(null);
  persistAll();
  renderHome();
  renderBookSection();
  renderBookings();
  renderAdmin();
  showTicket(booking);
  toast('Payment successful — slot '+booking.slotCode+' reserved.');
}
function openTicketOverlay(b, autoPrint){
  const zone = zoneOf(b.zone);
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'ticketOverlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Entry ticket</h3><button class="close-x" id="closeTicketBtn">✕</button></div>
      <div class="ticket">
        <div class="tick-ok">✓</div>
        <h3>${b.slotCode} is yours</h3>
        <p>Show this QR at the gate to check in.</p>
        <div class="paid-badge">✓ Payment confirmed · ${b.paymentMethod.toUpperCase()}</div>
        <div class="ticket-qr" id="ticketQr"></div>
        <div class="ticket-id">${b.id}</div>
        <div class="ticket-grid">
          <div class="tg"><span>Zone</span><b>${zone.name.split('·')[0].trim()}</b></div>
          <div class="tg"><span>Slot</span><b>${b.slotCode}</b></div>
          <div class="tg"><span>Vehicle</span><b>${b.vehicle}</b></div>
          <div class="tg"><span>Date</span><b>${b.date}</b></div>
          <div class="tg"><span>Time</span><b>${b.time} · ${b.duration}h</b></div>
          <div class="tg"><span>Amount paid</span><b>${fmtMoney(getBookingAmount(b))}</b></div>
          <div class="tg"><span>Account</span><b style="font-size:11px;">${b.customerEmail || currentUser?.email || ''}</b></div>
        </div>
      </div>
      <div class="ticket-actions">
        <button class="btn btn-ghost" id="printTicketBtn">Print ticket</button>
        <button class="btn btn-primary" id="viewBookingsBtn">View my bookings</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('closeTicketBtn').addEventListener('click', ()=>closeOverlay('ticketOverlay'));
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeOverlay('ticketOverlay'); });
  document.getElementById('viewBookingsBtn').addEventListener('click', ()=>{ closeOverlay('ticketOverlay'); goTo('bookings'); });
  document.getElementById('printTicketBtn').addEventListener('click', ()=>{
    window.print();
  });
  const qrTarget = document.getElementById('ticketQr');
  const ticketPayload = b.qrPayload || JSON.stringify({id:b.id, slot:b.slotCode, zone:b.zone, date:b.date, time:b.time, duration:b.duration, amount:getBookingAmount(b)});
  try{
    if(window.QRCode){
      qrTarget.innerHTML = '';
      new QRCode(qrTarget, { text: ticketPayload, width: 134, height: 134, correctLevel: QRCode.CorrectLevel.M });
    } else {
      qrTarget.innerHTML = '<div class="qr">' + qrHtml(ticketPayload) + '</div>';
    }
  }catch{
    qrTarget.innerHTML = '<div class="qr">' + qrHtml(ticketPayload) + '</div>';
  }
  if(autoPrint){
    setTimeout(()=>window.print(), 120);
  }
}
function showTicket(b){
  openTicketOverlay(b, false);
}

/* ===================== MY BOOKINGS ===================== */
function myBookings(){
  if(!currentUser) return [];
  return bookings.filter(b=>b.userEmail===currentUser.email);
}
function renderBookings(){
  const wrap = document.getElementById('bookingsList');
  wrap.innerHTML='';
  if(!currentUser){
    wrap.innerHTML = '<div class="empty-state"><h4>Sign in to see your bookings</h4><p>Your reservation history is tied to your email account.</p></div>';
    return;
  }
  const mine = myBookings();
  if(mine.length===0){
    wrap.innerHTML = '<div class="empty-state"><h4>No bookings yet</h4><p>Reserve a slot from Find &amp; Book to see it here.</p></div>';
    return;
  }
  mine.forEach(b=>{
    const zone = zoneOf(b.zone);
    const card = document.createElement('div');
    card.className='bcard';
    let actionHtml = '';
    if(b.status==='Confirmed'){
      actionHtml = `<span class="status-tag status-upcoming">Confirmed</span>
        <button class="btn btn-sm btn-ghost" data-action="ticket" data-id="${b.id}">View ticket</button>
        <button class="btn btn-sm btn-primary" data-action="checkin" data-id="${b.id}">Start parking</button>
        <button class="btn btn-sm btn-danger" data-action="cancel" data-id="${b.id}">Cancel</button>`;
    } else if(b.status==='Active'){
      actionHtml = `<span class="status-tag status-active">Active</span>
        <span class="timer" id="timer-${b.id}">--:--:--</span>
        <button class="btn btn-sm btn-ghost" data-action="ticket" data-id="${b.id}">View ticket</button>
        <button class="btn btn-sm btn-ghost" data-action="checkout" data-id="${b.id}">End &amp; pay</button>`;
    } else if(b.status==='Completed'){
      actionHtml = `<span class="status-tag status-completed">Completed</span><span style="font-family:'JetBrains Mono';font-size:13px;color:var(--available)">${fmtMoney(getBookingAmount(b))} paid</span>
        <button class="btn btn-sm btn-ghost" data-action="ticket" data-id="${b.id}">View ticket</button>
        <button class="btn btn-sm btn-ghost" data-action="print" data-id="${b.id}">Print ticket</button>`;
    } else {
      actionHtml = `<span class="status-tag status-cancelled">Cancelled</span>`;
    }
    card.innerHTML = `
      <div class="bslot">${bookingSlotCode(b)}</div>
      <div class="bmeta">
        <b>${zone.name}</b>
        <div class="brow">
          <div><span>Vehicle</span>${b.vehicle}</div>
          <div><span>Date</span>${b.date} · ${b.time}</div>
          <div><span>Duration</span>${b.duration}h</div>
          <div><span>Paid</span>${fmtMoney(getBookingAmount(b))}</div>
          <div><span>Booking ID</span><span class="mono">${b.id}</span></div>
        </div>
      </div>
      <div class="bcard-actions">${actionHtml}</div>
    `;
    wrap.appendChild(card);
  });
  wrap.querySelectorAll('[data-action]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      const b = bookings.find(x=>x.id===id);
      if(action==='checkin') checkIn(b);
      if(action==='checkout') checkOut(b);
      if(action==='cancel') cancelBooking(b);
      if(action==='ticket') openTicketOverlay(b, false);
      if(action==='print') openTicketOverlay(b, true);
    });
  });
}
function checkIn(b){
  if(!b || b.status!=='Confirmed') return;
  b.status='Active';
  b.checkInAt = Date.now();
  const s = findSlot(bookingSlotCode(b));
  if(s) s.status='occupied';
  persistAll();
  renderBookings(); renderHome(); renderAdmin();
  tickActiveTimers();
  toast('Checked in at '+bookingSlotCode(b)+'. Timer started.');
}
function checkOut(b){
  if(!b || b.status!=='Active') return;
  const elapsedMs = Date.now() - b.checkInAt;
  const elapsedHrs = Math.max(elapsedMs/3600000, 0.02);
  const zone = zoneOf(b.zone);
  b.finalAmount = Math.round(zone.rate * Math.min(elapsedHrs, b.duration));
  b.status='Completed';
  const s = findSlot(bookingSlotCode(b));
  if(s) s.status='available';
  persistAll();
  renderBookings(); renderHome(); renderBookSection(); renderAdmin();
  toast('Session ended. '+fmtMoney(b.finalAmount)+' charged for '+elapsedHrs.toFixed(2)+'h.');
}
function cancelBooking(b){
  if(!b || (b.status!=='Confirmed' && b.status!=='Active')) return;
  b.status='Cancelled';
  const s = findSlot(bookingSlotCode(b));
  if(s) s.status='available';
  persistAll();
  renderBookings(); renderHome(); renderBookSection(); renderAdmin();
  toast('Booking '+b.id+' cancelled.', true);
}
function tickActiveTimers(){
  bookings.filter(b=>b.status==='Active').forEach(b=>{
    const el = document.getElementById('timer-'+b.id);
    if(!el) return;
    const totalMs = b.duration*3600000;
    const elapsed = Date.now()-b.checkInAt;
    const remain = Math.max(totalMs-elapsed,0);
    const h = String(Math.floor(remain/3600000)).padStart(2,'0');
    const m = String(Math.floor((remain%3600000)/60000)).padStart(2,'0');
    const sec = String(Math.floor((remain%60000)/1000)).padStart(2,'0');
    el.textContent = h+':'+m+':'+sec+' left';
    el.classList.toggle('urgent', remain>0 && remain<=5*60000);
    if(remain>0 && remain<=5*60000 && !b.warnedExpiry){
      b.warnedExpiry = true;
      toast('Heads up — '+b.slotCode+' session ends in under 5 minutes.', true);
    }
    if(remain<=0 && b.status==='Active'){ checkOut(b); }
  });
}
setInterval(tickActiveTimers, 1000);

/* ===================== ADMIN ===================== */
function renderAdmin(){
  const totalBookings = bookings.length;
  const confirmedBookings = bookings.filter(b=>b.status!=='Cancelled').length;
  const availableSlots = slots.filter(s=>s.status==='available').length;
  const bookedSlots = slots.filter(s=>s.status==='reserved'||s.status==='occupied').length;
  const totalCollected = bookings.filter(b=>b.status!=='Cancelled').reduce((sum,b)=>sum+getBookingAmount(b),0);
  document.getElementById('kpiSlots').textContent = totalBookings;
  document.getElementById('kpiOcc').textContent = confirmedBookings;
  document.getElementById('kpiRev').textContent = availableSlots;
  document.getElementById('kpiUsers').textContent = bookedSlots;

  const paidBookings = bookings.filter(b=>b.status!=='Cancelled');
  const upiTotal = paidBookings.filter(b=>b.paymentMethod==='upi').reduce((s,b)=>s+getBookingAmount(b),0);
  const cardTotal = paidBookings.filter(b=>b.paymentMethod==='card').reduce((s,b)=>s+getBookingAmount(b),0);
  document.getElementById('kpiUpiTotal').textContent = fmtMoney(upiTotal);
  document.getElementById('kpiCardTotal').textContent = fmtMoney(cardTotal);
  const paymentNote = document.querySelector('#view-admin .card .notice');
  if(paymentNote){
    paymentNote.innerHTML = `💡 This dashboard uses demo payment records from ParkEase bookings. Total collected amount: <b>${fmtMoney(totalCollected)}</b>. UPI and card payment flows are simulated on the frontend.`;
  }

  const barsWrap = document.getElementById('zoneBars');
  barsWrap.innerHTML='';
  ZONES.forEach(z=>{
    const zSlots = slots.filter(s=>s.zone===z.id);
    const zOcc = zSlots.filter(s=>s.status==='occupied'||s.status==='reserved').length;
    const pct = Math.round(zOcc/zSlots.length*100);
    const row = document.createElement('div');
    row.className='bar-row';
    row.innerHTML = `<div class="bl">${z.name.split('·')[0].trim()}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="bar-pct">${pct}%</div>`;
    barsWrap.appendChild(row);
  });

  const recentBody = document.getElementById('recentBookingsBody');
  recentBody.innerHTML='';
  if(bookings.length===0){
    recentBody.innerHTML = '<tr><td colspan="6" style="color:var(--text-faint)">No bookings yet.</td></tr>';
  } else {
    bookings.slice(0,10).forEach(b=>{
      const tr = document.createElement('tr');
      const cls = b.status==='Confirmed'?'reserved':(b.status==='Active'?'occupied':(b.status==='Completed'?'available':'maintenance'));
      const methodLabel = b.paymentMethod ? (b.paymentMethod==='upi'?'📱 UPI':'💳 Card') : '—';
      tr.innerHTML = `<td class="mono">${b.id}</td><td><b>${bookingSlotCode(b)}</b></td><td style="font-size:11.5px;">${b.userEmail||b.customerEmail||'—'}</td><td>${methodLabel}</td><td class="mono">${fmtMoney(getBookingAmount(b))}</td><td><span class="mini-status ms-${cls}">${bookingStatusLabel(b.status)}</span></td>`;
      recentBody.appendChild(tr);
    });
  }

  const slotBody = document.getElementById('adminSlotBody');
  slotBody.innerHTML='';
  slots.forEach(s=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="mono"><b>${s.code}</b></td><td>${zoneOf(s.zone).name.split('·')[0].trim()}</td><td>${s.type}</td><td><span class="mini-status ms-${s.status}">${s.status}</span></td><td></td>`;
    const actionTd = tr.lastElementChild;
    if(s.status==='maintenance'){
      const b = document.createElement('button');
      b.className='tiny-btn'; b.textContent='Set available';
      b.addEventListener('click', ()=>{ s.status='available'; persistAll(); renderAdmin(); renderBookSection(); renderHome(); toast(s.code+' set to available.'); });
      actionTd.appendChild(b);
    } else if(s.status==='available'){
      const b = document.createElement('button');
      b.className='tiny-btn'; b.textContent='Mark maintenance';
      b.addEventListener('click', ()=>{ s.status='maintenance'; persistAll(); renderAdmin(); renderBookSection(); renderHome(); toast(s.code+' marked for maintenance.'); });
      actionTd.appendChild(b);
    } else {
      const b = document.createElement('button');
      b.className='tiny-btn'; b.textContent='Force free';
      b.addEventListener('click', ()=>{
        s.status='available';
        bookings.filter(bk=>bookingSlotCode(bk)===s.code && (bk.status==='Active'||bk.status==='Confirmed')).forEach(bk=>bk.status='Cancelled');
        persistAll();
        renderAdmin(); renderBookSection(); renderHome(); renderBookings();
        toast(s.code+' force-freed by admin.', true);
      });
      actionTd.appendChild(b);
    }
    slotBody.appendChild(tr);
  });
}

/* ===================== AUTH: LOGIN / SIGNUP ===================== */
document.getElementById('heroSignInBtn').addEventListener('click', ()=>openLogin());
document.getElementById('adminNavBtn').addEventListener('click', ()=>goTo('admin'));

function openLogin(){
  closeAnyOverlay();
  loginTab = 'signin';
  const overlay = document.createElement('div');
  overlay.className='overlay';
  overlay.id='loginOverlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Welcome to ParkEase</h3><button class="close-x" id="closeLoginBtn">✕</button></div>
      <div class="modal-sub">Sign in with your email, or create a new driver account.</div>
      <div class="seg-tabs">
        <button class="seg-tab active" id="tabSignin">Sign in</button>
        <button class="seg-tab" id="tabSignup">Create account</button>
      </div>
      <div id="loginFormHolder"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('closeLoginBtn').addEventListener('click', ()=>closeOverlay('loginOverlay'));
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeOverlay('loginOverlay'); });
  document.getElementById('tabSignin').addEventListener('click', ()=>{ loginTab='signin'; paintLoginTabs(); });
  document.getElementById('tabSignup').addEventListener('click', ()=>{ loginTab='signup'; paintLoginTabs(); });
  paintLoginTabs();
}
function paintLoginTabs(){
  document.getElementById('tabSignin').classList.toggle('active', loginTab==='signin');
  document.getElementById('tabSignup').classList.toggle('active', loginTab==='signup');
  const holder = document.getElementById('loginFormHolder');
  if(loginTab==='signin'){
    holder.innerHTML = `
      <div class="form-row"><label>Email</label><input type="email" id="fSiEmail" placeholder="you@email.com"></div>
      <div class="form-row"><label>Password</label><input type="password" id="fSiPass" placeholder="••••••••"></div>
      <div class="err" id="errSignin">No account matches those details.</div>
      <button class="btn btn-primary" style="width:100%;margin-top:6px;" id="doSigninBtn">Sign in</button>
    `;
    document.getElementById('doSigninBtn').addEventListener('click', doSignin);
  } else {
    holder.innerHTML = `
      <div class="form-row"><label>Full name</label><input type="text" id="fSuName" placeholder="e.g. Aarav Shah"></div>
      <div class="form-row"><label>Email</label><input type="email" id="fSuEmail" placeholder="you@email.com"></div>
      <div class="form-row"><label>Password</label><input type="password" id="fSuPass" placeholder="At least 6 characters"></div>
      <div class="err" id="errSignup">Check your details and try again.</div>
      <button class="btn btn-primary" style="width:100%;margin-top:6px;" id="doSignupBtn">Create account</button>
    `;
    document.getElementById('doSignupBtn').addEventListener('click', doSignup);
  }
}
function doSignin(){
  const email = document.getElementById('fSiEmail').value.trim().toLowerCase();
  const pass = document.getElementById('fSiPass').value;
  const errEl = document.getElementById('errSignin');
  const user = users.find(u=>u.email.toLowerCase()===email && u.password===pass);
  if(!user){ errEl.style.display='block'; return; }
  errEl.style.display='none';
  currentUser = user;
  finishLogin();
}
function doSignup(){
  const name = document.getElementById('fSuName').value.trim();
  const email = document.getElementById('fSuEmail').value.trim().toLowerCase();
  const pass = document.getElementById('fSuPass').value;
  const errEl = document.getElementById('errSignup');
  if(!name || !isValidEmail(email) || pass.length < 6){
    errEl.textContent = 'Enter a valid name, email, and a password of at least 6 characters.';
    errEl.style.display='block';
    return;
  }
  if(users.some(u=>u.email.toLowerCase()===email)){
    errEl.textContent = 'An account with this email already exists — sign in instead.';
    errEl.style.display='block';
    return;
  }
  const role = (email===ADMIN_EMAIL.toLowerCase()) ? 'Admin' : 'Driver';
  const user = {name, email, password:pass, role};
  users.push(user);
  persistUsers();
  currentUser = user;
  finishLogin();
}
function finishLogin(){
  closeOverlay('loginOverlay');
  updateRoleUI();
  persistSession();
  toast('Signed in as '+currentUser.name+' ('+currentUser.role+').');
  if(currentUser.role==='Admin'){ goTo('admin'); }
  else {
    if(!document.getElementById('view-book').classList.contains('hidden')) renderBookSection();
    if(!document.getElementById('view-bookings').classList.contains('hidden')) renderBookings();
  }
}
function updateRoleUI(){
  const pillText = document.getElementById('rolePillText');
  const roleDot = document.getElementById('roleDot');
  const loginBtn = document.getElementById('loginBtn');
  const adminNavBtn = document.getElementById('adminNavBtn');
  if(currentUser){
    pillText.textContent = currentUser.name+' · '+currentUser.role;
    roleDot.className = 'dot ' + (currentUser.role==='Admin' ? 'admin' : 'on');
    loginBtn.textContent = 'Sign out';
    loginBtn.onclick = ()=>{
      currentUser=null;
      persistSession();
      updateRoleUI();
      toast('Signed out.');
      renderBookSection();
      renderBookings();
      renderAdmin();
      goTo('home');
    };
    adminNavBtn.classList.toggle('hidden', currentUser.role!=='Admin');
  } else {
    pillText.textContent = 'Guest';
    roleDot.className = 'dot';
    loginBtn.textContent = 'Sign in';
    loginBtn.onclick = ()=>openLogin();
    adminNavBtn.classList.add('hidden');
  }
}

/* ===================== INIT ===================== */
persistAll();
renderHome();
renderBookSection();
updateRoleUI();
