/**
 * Antó-Jalos Digital Menu SPA Logic
 * Coordinates data loading, UI rendering, cart management, schedule validation and WhatsApp checkout.
 */

// Global State
let menuItems = [];
let businessConfig = {};
let cart = [];
let activeCategory = 'all';
let searchQuery = '';

// DOM Elements
const productsGrid = document.getElementById('products-grid');
const loadingSpinner = document.getElementById('loading-spinner');
const noResults = document.getElementById('no-results');
const categoryTitle = document.getElementById('category-title');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const categoriesNav = document.getElementById('categories-nav');

// Cart DOM Elements
const floatingCartBtn = document.getElementById('floating-cart');
const cartDrawer = document.getElementById('cart-drawer');
const closeDrawerBtn = document.getElementById('close-drawer');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const cartItemsContainer = document.getElementById('cart-items');
const emptyCartMsg = document.getElementById('empty-cart');
const checkoutForm = document.getElementById('checkout-form');
const drawerFooter = document.getElementById('drawer-footer');
const summarySubtotal = document.getElementById('summary-subtotal');
const summaryDelivery = document.getElementById('summary-delivery');
const deliveryCostRow = document.getElementById('delivery-cost-row');
const summaryTotal = document.getElementById('summary-total');
const sendWhatsappBtn = document.getElementById('send-whatsapp-btn');
const closedNotice = document.getElementById('closed-notice');
const statusBanner = document.getElementById('status-banner');
const statusText = document.getElementById('status-text');

// Form delivery controls
const deliveryRadioGroup = document.querySelectorAll('input[name="delivery-type"]');
const addressGroup = document.getElementById('address-group');
const customerAddress = document.getElementById('customer-address');
const paymentMethod = document.getElementById('payment-method');
const cashChangeGroup = document.getElementById('cash-change-group');
const cashChangeInput = document.getElementById('cash-change');

// Modal DOM Elements
const productModal = document.getElementById('product-modal');
const modalBackdrop = document.getElementById('modal-backdrop');
const closeModalBtn = document.getElementById('close-modal');
const customizationForm = document.getElementById('customization-form');
const modalQtyVal = document.getElementById('modal-qty');
const modalQtyMinus = document.getElementById('modal-qty-minus');
const modalQtyPlus = document.getElementById('modal-qty-plus');
const modalTotalPrice = document.getElementById('modal-total-price');

// Temporal State for Modal Customization
let selectedProduct = null;
let currentModalQty = 1;
let currentBasePrice = 0;

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    // Load state from localStorage if exists (cart state)
    loadCartFromLocalStorage();
    
    // Load config and menu data
    await loadData();
    
    // Setup Event Listeners
    setupEventListeners();
    
    // Check schedule status immediately
    checkBusinessHours();
    // Re-check schedule every 30 seconds
    setInterval(checkBusinessHours, 30000);
});

// Load Config & Menu from API or Fallback
async function loadData() {
    try {
        // Try fetching config first
        const configResponse = await fetch('api.php?action=get_config');
        if (configResponse.ok) {
            businessConfig = await configResponse.json();
        } else {
            throw new Error('Config API not responding');
        }
    } catch (e) {
        console.warn('Using fallback configuration', e);
        businessConfig = DEFAULT_CONFIG;
    }
    
    try {
        // Try fetching menu items
        const menuResponse = await fetch('api.php?action=get_menu');
        if (menuResponse.ok) {
            menuItems = await menuResponse.json();
        } else {
            throw new Error('Menu API not responding');
        }
    } catch (e) {
        console.warn('Using fallback menu items', e);
        menuItems = DEFAULT_MENU_ITEMS;
    }

    // Apply configuration changes to UI
    document.title = `${businessConfig.businessName} | Menú Digital`;
    document.querySelector('.brand-info h1').textContent = businessConfig.businessName;
    
    // Hide loader and display products
    loadingSpinner.style.display = 'none';
    productsGrid.style.display = 'grid';
    
    renderMenu();
    updateCartUI();
}

// Check Business Open/Closed Status
function checkBusinessHours() {
    if (!businessConfig.schedule) return;
    
    const schedule = businessConfig.schedule;
    
    // Check if always open
    if (schedule.alwaysOpen) {
        setBusinessOpen(true);
        return;
    }
    
    // Timezone check: we calculate current local date/time of America/Mexico_City
    // We can format it using Intl
    const options = {
        timeZone: schedule.timezone || 'America/Mexico_City',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(new Date());
    
    let weekday = '';
    let hourStr = '';
    let minuteStr = '';
    
    for (const part of parts) {
        if (part.type === 'weekday') weekday = part.value.toLowerCase();
        if (part.type === 'hour') hourStr = part.value;
        if (part.type === 'minute') minuteStr = part.value;
    }
    
    // Translate weekday English standard parts back to Spanish schedule map (or keep it in English, but config is in english)
    // English weekdays: monday, tuesday, wednesday, thursday, friday, saturday, sunday
    const dayConfig = schedule.days[weekday];
    
    if (!dayConfig || !dayConfig.enabled) {
        setBusinessOpen(false, `Cerrado hoy ${translateDay(weekday)}`);
        return;
    }
    
    const currentMinutes = parseInt(hourStr) * 60 + parseInt(minuteStr);
    
    const [startHour, startMin] = dayConfig.start.split(':').map(Number);
    const [endHour, endMin] = dayConfig.end.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    // Handle overnight schedules (e.g., 18:00 to 02:00)
    let isOpen = false;
    if (endMinutes < startMinutes) {
        // Overnight schedule
        isOpen = (currentMinutes >= startMinutes || currentMinutes <= endMinutes);
    } else {
        // Normal daytime schedule
        isOpen = (currentMinutes >= startMinutes && currentMinutes <= endMinutes);
    }
    
    if (isOpen) {
        setBusinessOpen(true);
    } else {
        setBusinessOpen(false, `CERRADO - Abrimos a las ${dayConfig.start}`);
    }
}

function translateDay(day) {
    const days = {
        monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles',
        thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo'
    };
    return days[day] || day;
}

function setBusinessOpen(isOpen, message = '') {
    if (isOpen) {
        statusBanner.className = "status-banner open";
        statusText.innerHTML = '<i class="fa-solid fa-circle-check"></i> ¡Estamos abiertos! Haz tu pedido ahora.';
        sendWhatsappBtn.disabled = false;
        closedNotice.style.display = 'none';
    } else {
        statusBanner.className = "status-banner closed";
        statusText.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> ${message}`;
        sendWhatsappBtn.disabled = true;
        closedNotice.style.display = 'block';
    }
}

// Render Products Menu Grid
function renderMenu() {
    productsGrid.innerHTML = '';
    
    const filtered = menuItems.filter(item => {
        // Filter by search query
        const matchesSearch = searchQuery === '' || 
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            item.description.toLowerCase().includes(searchQuery.toLowerCase());
            
        // Filter by category
        const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
        
        return matchesSearch && matchesCategory;
    });
    
    if (filtered.length === 0) {
        productsGrid.style.display = 'none';
        noResults.style.display = 'block';
    } else {
        productsGrid.style.display = 'grid';
        noResults.style.display = 'none';
        
        filtered.forEach(item => {
            const card = document.createElement('div');
            card.className = 'product-card';
            
            // Image handling (relative or absolute)
            const imgPath = item.image ? item.image : 'https://placehold.co/400x300/0b132b/ff5722?text=' + encodeURIComponent(item.name);
            
            card.innerHTML = `
                <div class="product-img-wrapper">
                    <img src="${imgPath}" alt="${item.name}" class="product-img" loading="lazy" onerror="this.src='https://placehold.co/400x300/0b132b/ff5722?text=${encodeURIComponent(item.name)}';">
                    ${item.category === 'combos' ? '<span class="product-badge">Combo</span>' : ''}
                </div>
                <div class="product-info">
                    <h3 class="product-title">${item.name}</h3>
                    <p class="product-description">${item.description}</p>
                    <div class="product-footer">
                        <span class="product-price">$${parseFloat(item.price).toFixed(2)}</span>
                        <button class="add-btn" data-id="${item.id}" aria-label="Agregar ${item.name}">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                </div>
            `;
            
            // Add click event for adding/customizing product
            card.querySelector('.add-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openCustomizationModal(item);
            });
            
            card.addEventListener('click', () => {
                openCustomizationModal(item);
            });
            
            productsGrid.appendChild(card);
        });
    }
    
    // Update active category title header text
    if (activeCategory === 'all') {
        categoryTitle.textContent = searchQuery ? `Resultados de "${searchQuery}"` : 'Todos los Productos';
    } else {
        const btn = document.querySelector(`.category-btn[data-category="${activeCategory}"]`);
        categoryTitle.textContent = btn ? btn.textContent.trim() : 'Menú';
    }
}

// Open Customization Modal
function openCustomizationModal(product) {
    selectedProduct = product;
    currentModalQty = 1;
    modalQtyVal.textContent = currentModalQty;
    
    // Render Modal Header details
    document.getElementById('modal-product-name').textContent = product.name;
    document.getElementById('modal-product-desc').textContent = product.description;
    document.getElementById('modal-product-price').textContent = `$${parseFloat(product.price).toFixed(2)}`;
    
    const modalImg = document.getElementById('modal-product-img');
    if (product.image) {
        modalImg.src = product.image;
        modalImg.style.display = 'block';
    } else {
        modalImg.style.display = 'none';
    }
    
    // Clean and render customizable options form
    customizationForm.innerHTML = '';
    
    if (product.modifiers && product.modifiers.length > 0) {
        product.modifiers.forEach((group, groupIdx) => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'option-group';
            
            groupDiv.innerHTML = `
                <div class="option-group-title">
                    <span>${group.name}</span>
                    ${group.required ? '<span class="group-required-badge">Obligatorio</span>' : ''}
                </div>
                <div class="options-list"></div>
            `;
            
            const optionsList = groupDiv.querySelector('.options-list');
            
            // Add custom instructions or limits label if checkbox group with multiple choices limit
            const isCheckbox = group.type === 'checkbox' || (group.max_choices && group.max_choices > 1);
            if (isCheckbox && group.max_choices) {
                const limitLabel = document.createElement('div');
                limitLabel.className = 'group-limit-info';
                limitLabel.style.fontSize = '0.8rem';
                limitLabel.style.color = 'var(--accent-hover)';
                limitLabel.style.marginTop = '-8px';
                limitLabel.style.marginBottom = '12px';
                limitLabel.innerHTML = `<i class="fa-solid fa-info-circle"></i> Puedes seleccionar hasta <strong>${group.max_choices}</strong> opciones`;
                groupDiv.querySelector('.option-group-title').after(limitLabel);
            }
            
            group.options.forEach((opt, optIdx) => {
                const optLabel = document.createElement('label');
                optLabel.className = 'custom-option';
                
                // For checkboxes, we don't check by default, for radio we check the first option if required
                const isSelectedByDefault = !isCheckbox && optIdx === 0 && group.required;
                const priceText = opt.price > 0 ? `+$${parseFloat(opt.price).toFixed(2)}` : 'Gratis';
                
                // Native required only for radio buttons (not checkbox groups because that forces checking all)
                const isNativeRequired = !isCheckbox && group.required;
                
                optLabel.innerHTML = `
                    <div class="option-input-wrapper">
                        <input 
                            type="${isCheckbox ? 'checkbox' : 'radio'}" 
                            name="mod_${group.id}" 
                            value="${opt.name}"
                            data-price="${opt.price}"
                            data-group-id="${group.id}"
                            data-group-name="${group.name}"
                            ${isSelectedByDefault ? 'checked' : ''}
                            ${isNativeRequired ? 'required' : ''}
                        >
                        <span class="option-name">${opt.name}</span>
                    </div>
                    <span class="option-price ${opt.price === 0 ? 'free' : ''}">${priceText}</span>
                `;
                
                // Add event listener to recalculate price when selecting options
                optLabel.querySelector('input').addEventListener('change', calculateModalPrice);
                
                optionsList.appendChild(optLabel);
            });
            
            // Checkbox limit logic
            if (isCheckbox && group.max_choices) {
                const updateCheckboxLimits = () => {
                    const checkedCount = optionsList.querySelectorAll('input[type="checkbox"]:checked').length;
                    const allCheckboxes = optionsList.querySelectorAll('input[type="checkbox"]');
                    
                    if (checkedCount >= group.max_choices) {
                        allCheckboxes.forEach(cb => {
                            if (!cb.checked) {
                                cb.disabled = true;
                                cb.closest('.custom-option').style.opacity = '0.4';
                            }
                        });
                    } else {
                        allCheckboxes.forEach(cb => {
                            cb.disabled = false;
                            cb.closest('.custom-option').style.opacity = '1';
                        });
                    }
                };
                
                optionsList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    cb.addEventListener('change', () => {
                        updateCheckboxLimits();
                    });
                });
                
                // Initialize limits
                updateCheckboxLimits();
            }
            
            customizationForm.appendChild(groupDiv);
        });
    }
    
    calculateModalPrice();
    
    // Display Modal
    productModal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Stop background scrolling
}

// Calculate total product price inside the modal
function calculateModalPrice() {
    if (!selectedProduct) return;
    
    let price = parseFloat(selectedProduct.price);
    
    // Add checked modifiers prices
    const checkedInputs = customizationForm.querySelectorAll('input:checked');
    checkedInputs.forEach(input => {
        const optPrice = parseFloat(input.dataset.price) || 0;
        price += optPrice;
    });
    
    currentBasePrice = price;
    const finalPrice = price * currentModalQty;
    modalTotalPrice.textContent = `$${finalPrice.toFixed(2)}`;
}

// Close Modal helper
function closeModal() {
    productModal.classList.remove('active');
    document.body.style.overflow = ''; // Resume scrolling
    selectedProduct = null;
}

// Handle Add Product Customization Form Submit
customizationForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!selectedProduct) return;
    
    const selectedOptions = {};
    const checkedInputs = customizationForm.querySelectorAll('input:checked');
    
    // Group selected options by modifier ID
    checkedInputs.forEach(input => {
        const groupId = input.dataset.groupId;
        const groupName = input.dataset.groupName;
        const optName = input.value;
        const optPrice = parseFloat(input.dataset.price) || 0;
        
        if (!selectedOptions[groupId]) {
            selectedOptions[groupId] = {
                name: groupName,
                selections: []
            };
        }
        
        selectedOptions[groupId].selections.push({
            name: optName,
            price: optPrice
        });
    });
    
    // Manual validation of required checkbox groups (since native required doesn't work for multiple choice checkboxes)
    let isValid = true;
    if (selectedProduct.modifiers && selectedProduct.modifiers.length > 0) {
        selectedProduct.modifiers.forEach(group => {
            if (group.required) {
                const isCheckbox = group.type === 'checkbox' || (group.max_choices && group.max_choices > 1);
                if (isCheckbox) {
                    if (!selectedOptions[group.id] || selectedOptions[group.id].selections.length === 0) {
                        alert(`Por favor, selecciona al menos una opción para: ${group.name}`);
                        isValid = false;
                    }
                }
            }
        });
    }
    
    if (!isValid) return;
    
    // Add to Cart
    addToCart(selectedProduct, currentModalQty, selectedOptions);
    closeModal();
});

// Cart Operations
function addToCart(product, qty, selectedOptions) {
    // Generate a unique ID based on product ID and serialized modifiers
    // This allows having the same product twice in the cart but with different modifiers
    const uniqueKey = product.id + '_' + JSON.stringify(selectedOptions);
    
    // Check if identical item already exists in cart
    const existingIndex = cart.findIndex(item => item.uniqueKey === uniqueKey);
    
    if (existingIndex > -1) {
        cart[existingIndex].quantity += qty;
    } else {
        cart.push({
            uniqueKey: uniqueKey,
            productId: product.id,
            name: product.name,
            image: product.image,
            basePrice: currentBasePrice, // Unit price with selected modifiers included
            quantity: qty,
            selectedOptions: selectedOptions
        });
    }
    
    saveCartToLocalStorage();
    updateCartUI();
    
    // Make the floating cart button bounce or react
    floatingCartBtn.classList.add('bounce');
    setTimeout(() => {
        floatingCartBtn.classList.remove('bounce');
    }, 500);
}

function updateCartQty(uniqueKey, delta) {
    const itemIndex = cart.findIndex(item => item.uniqueKey === uniqueKey);
    if (itemIndex === -1) return;
    
    cart[itemIndex].quantity += delta;
    
    if (cart[itemIndex].quantity <= 0) {
        cart.splice(itemIndex, 1);
    }
    
    saveCartToLocalStorage();
    updateCartUI();
}

function removeFromCart(uniqueKey) {
    cart = cart.filter(item => item.uniqueKey !== uniqueKey);
    saveCartToLocalStorage();
    updateCartUI();
}

// Render Cart items and totals in UI
function updateCartUI() {
    cartItemsContainer.innerHTML = '';
    
    let totalItems = 0;
    let subtotal = 0;
    
    if (cart.length === 0) {
        emptyCartMsg.style.display = 'block';
        checkoutForm.style.display = 'none';
        drawerFooter.style.display = 'none';
        floatingCartBtn.style.display = 'none';
    } else {
        emptyCartMsg.style.display = 'none';
        checkoutForm.style.display = 'block';
        drawerFooter.style.display = 'flex';
        floatingCartBtn.style.display = 'flex';
        
        cart.forEach(item => {
            totalItems += item.quantity;
            const itemTotal = item.basePrice * item.quantity;
            subtotal += itemTotal;
            
            // Format modifiers description
            let modsHTML = '';
            const modGroups = Object.values(item.selectedOptions);
            if (modGroups.length > 0) {
                const modStrings = [];
                modGroups.forEach(grp => {
                    const selectStrs = grp.selections.map(s => {
                        return s.price > 0 ? `${s.name} (+$${s.price.toFixed(0)})` : s.name;
                    });
                    modStrings.push(`<strong>${grp.name}:</strong> ${selectStrs.join(', ')}`);
                });
                modsHTML = `<div class="cart-item-modifiers">${modStrings.join('<br>')}</div>`;
            }
            
            const itemDiv = document.createElement('div');
            itemDiv.className = 'cart-item';
            
            const imgPath = item.image ? item.image : 'https://placehold.co/100x100/0b132b/ff5722?text=' + encodeURIComponent(item.name);
            
            itemDiv.innerHTML = `
                <img src="${imgPath}" alt="${item.name}" class="cart-item-img" onerror="this.src='https://placehold.co/100x100/0b132b/ff5722?text=${encodeURIComponent(item.name)}';">
                <div class="cart-item-details">
                    <span class="cart-item-name">${item.name}</span>
                    ${modsHTML}
                    <div class="cart-item-bottom">
                        <span class="cart-item-price">$${itemTotal.toFixed(2)}</span>
                        <div class="qty-control-sm">
                            <button type="button" class="cart-qty-minus"><i class="fa-solid fa-minus"></i></button>
                            <span>${item.quantity}</span>
                            <button type="button" class="cart-qty-plus"><i class="fa-solid fa-plus"></i></button>
                        </div>
                    </div>
                </div>
                <button type="button" class="remove-item-btn" aria-label="Eliminar item">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            
            // Event Listeners for quantity and remove
            itemDiv.querySelector('.cart-qty-minus').addEventListener('click', () => updateCartQty(item.uniqueKey, -1));
            itemDiv.querySelector('.cart-qty-plus').addEventListener('click', () => updateCartQty(item.uniqueKey, 1));
            itemDiv.querySelector('.remove-item-btn').addEventListener('click', () => removeFromCart(item.uniqueKey));
            
            cartItemsContainer.appendChild(itemDiv);
        });
    }
    
    // Update Cart Totals Display
    const formattedSubtotal = `$${subtotal.toFixed(2)}`;
    
    summarySubtotal.textContent = formattedSubtotal;
    document.getElementById('cart-badge').textContent = totalItems;
    document.getElementById('cart-btn-total').textContent = formattedSubtotal;
    
    // Delivery calculations
    const deliveryMethod = document.querySelector('input[name="delivery-type"]:checked').value;
    if (deliveryMethod === 'domicilio') {
        deliveryCostRow.style.display = 'flex';
        
        if (businessConfig.deliveryCost === 'cotizar' || isNaN(parseFloat(businessConfig.deliveryCost))) {
            summaryDelivery.textContent = 'Por cotizar';
            summaryTotal.textContent = formattedSubtotal;
        } else {
            const cost = parseFloat(businessConfig.deliveryCost);
            summaryDelivery.textContent = `$${cost.toFixed(2)}`;
            summaryTotal.textContent = `$${(subtotal + cost).toFixed(2)}`;
        }
    } else {
        // Pick-up
        deliveryCostRow.style.display = 'none';
        summaryTotal.textContent = formattedSubtotal;
    }
}

// Local Storage helpers
function saveCartToLocalStorage() {
    localStorage.setItem('antojalos_cart', JSON.stringify(cart));
}

function loadCartFromLocalStorage() {
    const saved = localStorage.getItem('antojalos_cart');
    if (saved) {
        try {
            cart = JSON.parse(saved);
        } catch (e) {
            console.error(e);
            cart = [];
        }
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Search Bar Input
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        if (searchQuery.trim() !== '') {
            clearSearchBtn.style.display = 'block';
        } else {
            clearSearchBtn.style.display = 'none';
        }
        renderMenu();
    });
    
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        renderMenu();
    });
    
    // Category Tabs click
    categoriesNav.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-btn');
        if (!btn) return;
        
        // Remove active class from all
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        activeCategory = btn.dataset.category;
        renderMenu();
        
        // Scroll navigation into view on mobile
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
    
    // Category Swipe Arrows (for Desktop mouse scrolling)
    const arrowLeft = document.getElementById('scroll-left');
    const arrowRight = document.getElementById('scroll-right');
    
    if (arrowLeft && arrowRight) {
        // Show arrows on desktop
        const checkScrollArrows = () => {
            if (categoriesNav.scrollWidth > categoriesNav.clientWidth) {
                arrowLeft.style.display = window.innerWidth > 768 ? 'flex' : 'none';
                arrowRight.style.display = window.innerWidth > 768 ? 'flex' : 'none';
            } else {
                arrowLeft.style.display = 'none';
                arrowRight.style.display = 'none';
            }
        };
        
        window.addEventListener('resize', checkScrollArrows);
        setTimeout(checkScrollArrows, 500); // Check after items load
        
        arrowLeft.addEventListener('click', () => {
            categoriesNav.scrollBy({ left: -200, behavior: 'smooth' });
        });
        
        arrowRight.addEventListener('click', () => {
            categoriesNav.scrollBy({ left: 200, behavior: 'smooth' });
        });
    }
    
    // Cart Drawer actions
    floatingCartBtn.addEventListener('click', () => {
        cartDrawer.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    
    const closeDrawer = () => {
        cartDrawer.classList.remove('active');
        document.body.style.overflow = '';
    };
    
    closeDrawerBtn.addEventListener('click', closeDrawer);
    drawerBackdrop.addEventListener('click', closeDrawer);
    
    // Delivery Radio selection toggle
    deliveryRadioGroup.forEach(radio => {
        radio.addEventListener('change', (e) => {
            // Remove active classes
            document.querySelectorAll('.delivery-radio').forEach(lbl => lbl.classList.remove('active'));
            
            // Add active class to selected label parent
            e.target.closest('.delivery-radio').classList.add('active');
            
            const method = e.target.value;
            if (method === 'domicilio') {
                addressGroup.style.display = 'block';
                customerAddress.required = true;
            } else {
                addressGroup.style.display = 'none';
                customerAddress.required = false;
            }
            
            updateCartUI();
        });
    });
    
    // Cash change field display logic
    paymentMethod.addEventListener('change', (e) => {
        if (e.target.value === 'Efectivo') {
            cashChangeGroup.style.display = 'block';
        } else {
            cashChangeGroup.style.display = 'none';
            cashChangeInput.value = '';
        }
    });
    
    // Modal qty selectors
    modalQtyMinus.addEventListener('click', () => {
        if (currentModalQty > 1) {
            currentModalQty--;
            modalQtyVal.textContent = currentModalQty;
            calculateModalPrice();
        }
    });
    
    modalQtyPlus.addEventListener('click', () => {
        currentModalQty++;
        modalQtyVal.textContent = currentModalQty;
        calculateModalPrice();
    });
    
    // Close modal triggers
    closeModalBtn.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);
    
    // Checkout form submit (WhatsApp Checkout)
    checkoutForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendOrderToWhatsApp();
    });
}

// Generate message content and redirect to WhatsApp
function sendOrderToWhatsApp() {
    const customerNameVal = document.getElementById('customer-name').value.trim();
    const deliveryMethod = document.querySelector('input[name="delivery-type"]:checked').value;
    const addressVal = customerAddress.value.trim();
    const paymentVal = paymentMethod.value;
    const changeVal = cashChangeInput.value.trim();
    const notesVal = document.getElementById('order-notes').value.trim();
    
    let message = `*🍔 NUEVO PEDIDO - ${businessConfig.businessName.toUpperCase()} 🍔*\n`;
    message += `-------------------------------------------\n`;
    message += `👤 *Cliente:* ${customerNameVal}\n`;
    message += `🛵 *Entrega:* ${deliveryMethod === 'domicilio' ? 'A Domicilio' : 'Para Recoger en Sucursal'}\n`;
    
    if (deliveryMethod === 'domicilio') {
        message += `📍 *Dirección:* ${addressVal}\n`;
    }
    message += `💳 *Método de Pago:* ${paymentVal}\n`;
    if (paymentVal === 'Efectivo' && changeVal) {
        message += `💵 *Paga con:* $${changeVal} (Llevar cambio)\n`;
    }
    if (notesVal) {
        message += `📝 *Notas:* ${notesVal}\n`;
    }
    message += `-------------------------------------------\n\n`;
    message += `🛒 *DETALLE DEL PEDIDO:*\n`;
    
    let subtotal = 0;
    cart.forEach(item => {
        const itemTotal = item.basePrice * item.quantity;
        subtotal += itemTotal;
        
        message += `*${item.quantity}x* ${item.name} ($${(item.basePrice).toFixed(2)} c/u)\n`;
        
        // List selected modifiers
        const modGroups = Object.values(item.selectedOptions);
        if (modGroups.length > 0) {
            modGroups.forEach(grp => {
                const selectStrs = grp.selections.map(s => {
                    return s.price > 0 ? `${s.name} (+$${s.price.toFixed(0)})` : s.name;
                });
                message += `   • _${grp.name}: ${selectStrs.join(', ')}_\n`;
            });
        }
        message += `   *Subtotal:* $${itemTotal.toFixed(2)}\n\n`;
    });
    
    message += `-------------------------------------------\n`;
    message += `💵 *Subtotal:* $${subtotal.toFixed(2)}\n`;
    
    if (deliveryMethod === 'domicilio') {
        if (businessConfig.deliveryCost === 'cotizar' || isNaN(parseFloat(businessConfig.deliveryCost))) {
            message += `🛵 *Envío:* Por cotizar\n`;
            message += `💰 *TOTAL ESTIMADO:* *$${subtotal.toFixed(2)}* + Envío\n`;
        } else {
            const cost = parseFloat(businessConfig.deliveryCost);
            message += `🛵 *Envío:* $${cost.toFixed(2)}\n`;
            message += `💰 *TOTAL A PAGAR:* *$${(subtotal + cost).toFixed(2)}*\n`;
        }
    } else {
        message += `💰 *TOTAL A PAGAR:* *$${subtotal.toFixed(2)}*\n`;
    }
    
    message += `-------------------------------------------\n`;
    message += `¡Muchas gracias por su preferencia! 🙏✨`;
    
    // WhatsApp API Link formatting
    const cleanPhone = businessConfig.whatsappPhone.replace(/\D/g, ''); // Numeric characters only
    const encodedText = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;
    
    // Redirect
    window.open(whatsappUrl, '_blank');
    
    // Clear cart after successful checkout
    cart = [];
    saveCartToLocalStorage();
    updateCartUI();
    checkoutForm.reset();
    cartDrawer.classList.remove('active');
    document.body.style.overflow = '';
    
    // Show user a pleasant toast or alert
    alert('¡Tu pedido ha sido preparado! Serás redirigido a WhatsApp para enviar el mensaje con los detalles de tu orden.');
}
