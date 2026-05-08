// ── Lucky Draw Shared Data Layer ───────────────────────────────────────
// All pages read/write via this module. Data persists in localStorage.

const LD = (() => {

  const KEYS = {
    config: 'ld_config',
    slots:  'ld_slots',
    orders: 'ld_orders',
  };

  const DEFAULT_CONFIG = {
    name: 'Portgas Arc',
    series: 'One Piece',
    badge: 'PSA 10 / BGS 10',
    pricePerCard: 9999,
    totalSlots: 66,
    streamUrls: { yt: '', fb: '', tt: '' },
    streamDate: '2026-05-15T20:00',
    status: 'live', // draft | live | ended
    bankName: 'Kasikorn Bank',
    bankAccount: '012-3-45678-9',
    bankHolder: 'Lucky Draw Co., Ltd.',
    promptpayId: '0812345678',
    cards: [
      { id: 1, name: 'Portgas D. Ace Alt Art', grade: 'PSA 10', series: 'One Piece', highlight: true, prizeRank: 1, value: 85000 },
      { id: 2, name: 'Monkey D. Luffy',        grade: 'PSA 10', series: 'One Piece', highlight: true, prizeRank: 2, value: 42000 },
      { id: 3, name: 'Shanks Alt Art',          grade: 'BGS 10', series: 'One Piece', highlight: true, prizeRank: 3, value: 28000 },
      { id: 4, name: 'Roronoa Zoro',            grade: 'PSA 10', series: 'One Piece', highlight: false, prizeRank: 0, value: 15000 },
      { id: 5, name: 'Nami',                    grade: 'BGS 10', series: 'One Piece', highlight: false, prizeRank: 0, value: 12000 },
      { id: 6, name: 'Marshall D. Teach',       grade: 'PSA 10', series: 'One Piece', highlight: false, prizeRank: 0, value: 9000 },
      { id: 7, name: 'Silver Rayleigh',         grade: 'PSA 10', series: 'One Piece', highlight: false, prizeRank: 0, value: 8500 },
      { id: 8, name: 'Boa Hancock',             grade: 'BGS 10', series: 'One Piece', highlight: false, prizeRank: 0, value: 11000 },
      { id: 9, name: 'Trafalgar Law',           grade: 'PSA 10', series: 'One Piece', highlight: false, prizeRank: 0, value: 7500 },
    ],
    topPrizes: [1, 2, 3], // card ids
  };

  function getConfig() {
    try {
      const raw = localStorage.getItem(KEYS.config);
      return raw ? JSON.parse(raw) : DEFAULT_CONFIG;
    } catch { return DEFAULT_CONFIG; }
  }

  function saveConfig(data) {
    localStorage.setItem(KEYS.config, JSON.stringify(data));
  }

  function getSlots() {
    try {
      const raw = localStorage.getItem(KEYS.slots);
      if (raw) return JSON.parse(raw);
    } catch {}
    // Build default slots
    const cfg = getConfig();
    const slots = {};
    for (let i = 1; i <= cfg.totalSlots; i++) {
      slots[i] = 'available';
    }
    // Pre-populate some taken slots for demo
    [1,3,5,7,9,11,13,14,15,18,20,22,24,25,27,29,31,33,34,36,37,40,42,44,45,48,50,52,53,55,56,58,60,62,63,65].forEach(n => {
      if (slots[n]) slots[n] = 'taken';
    });
    return slots;
  }

  function saveSlots(slots) {
    localStorage.setItem(KEYS.slots, JSON.stringify(slots));
  }

  function getOrders() {
    try {
      const raw = localStorage.getItem(KEYS.orders);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function saveOrder(order) {
    const orders = getOrders();
    orders.unshift(order);
    localStorage.setItem(KEYS.orders, JSON.stringify(orders));
  }

  function updateOrder(id, updates) {
    const orders = getOrders();
    const idx = orders.findIndex(o => o.id === id);
    if (idx >= 0) orders[idx] = { ...orders[idx], ...updates };
    localStorage.setItem(KEYS.orders, JSON.stringify(orders));
  }

  function saveOrders(orders) {
    localStorage.setItem(KEYS.orders, JSON.stringify(orders));
  }

  function resetAll() {
    localStorage.removeItem(KEYS.config);
    localStorage.removeItem(KEYS.slots);
    localStorage.removeItem(KEYS.orders);
  }

  return { getConfig, saveConfig, getSlots, saveSlots, getOrders, saveOrder, updateOrder, saveOrders, resetAll, DEFAULT_CONFIG };
})();
