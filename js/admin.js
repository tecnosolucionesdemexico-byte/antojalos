/**
 * Antó-Jalos Admin Panel Logic
 * Coordinates authentication, CRUD operations for categories/products,
 * modifier building, schedule configuration, image upload, and JSON export.
 */

// Global state
let menuItems = [];
let businessConfig = {};
let activeTab = 'products';
let currentEditingProduct = null;
let currentEditingCategory = null;
let categoriesList = [];
let isPHPBackend = false;

// Default categories in case config doesn't have them
const DEFAULT_CATEGORIES = [
    { id: "hamburguesas", name: "Burgers", icon: "fa-hamburger" },
    { id: "dogos", name: "Dogos", icon: "fa-hotdog" },
    { id: "alitas", name: "Alitas", icon: "fa-fire" },
    { id: "paquetes", name: "Paquetes", icon: "fa-box-archive" },
    { id: "botaneros", name: "Botaneros", icon: "fa-drumstick-bite" },
    { id: "papas", name: "Papas", icon: "fa-cheese" },
    { id: "combos", name: "Combos", icon: "fa-cubes" },
    { id: "kids", name: "Kids", icon: "fa-child" }
];

// SHA256 Hashing helper using browser native Web Crypto API
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Check if PHP backend is available
async function checkBackend() {
    try {
        const res = await fetch('api.php?action=get_config');
        isPHPBackend = res.ok;
    } catch (e) {
        isPHPBackend = false;
    }
    
    const badge = document.getElementById('storage-mode-badge');
    if (isPHPBackend) {
        badge.className = "badge badge-storage";
        badge.innerHTML = '<i class="fa-solid fa-server"></i> Servidor Conectado (PHP)';
    } else {
        badge.className = "badge badge-storage warning";
        badge.style.backgroundColor = "var(--warning)";
        badge.style.color = "#000";
        badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Modo Local (Sin PHP)';
    }
}

// DOM Elements & Event Listeners setup
document.addEventListener('DOMContentLoaded', async () => {
    await checkBackend();
    await loadInitialData();
    setupAuthListeners();
    setupTabListeners();
    setupProductCRUD();
    setupCategoryCRUD();
    setupConfigForm();
    
    // Check if token exists in session
    const savedToken = sessionStorage.getItem('admin_token');
    const expectedHash = businessConfig.adminPasswordHash || "79b1d9e3285664c318128899d048be76f6db1998f045d325c80c023707b30761"; // Antojalos2026
    
    if (savedToken === expectedHash) {
        showDashboard();
    }
});

// Load menu and configurations
async function loadInitialData() {
    if (isPHPBackend) {
        try {
            const configRes = await fetch('api.php?action=get_config');
            const menuRes = await fetch('api.php?action=get_menu');
            
            // Note: Public config doesn't send password hash. In that case, we keep local fallback hash.
            const serverConfig = await configRes.json();
            businessConfig = {
                ...DEFAULT_CONFIG,
                ...serverConfig
            };
            
            menuItems = await menuRes.json();
        } catch (e) {
            console.error("Error loading server data, falling back to local storage or script data", e);
            loadFallbackData();
        }
    } else {
        loadFallbackData();
    }
    
    // Set categories
    categoriesList = businessConfig.categories || DEFAULT_CATEGORIES;
    businessConfig.categories = categoriesList; // Ensure it is initialized
}

function loadFallbackData() {
    // Check local storage first
    const localMenu = localStorage.getItem('antojalos_menu_db');
    const localConfig = localStorage.getItem('antojalos_config_db');
    
    menuItems = localMenu ? JSON.parse(localMenu) : DEFAULT_MENU_ITEMS;
    businessConfig = localConfig ? JSON.parse(localConfig) : DEFAULT_CONFIG;
}

// Authentication Logic
function setupAuthListeners() {
    const loginForm = document.getElementById('login-form');
    const passwordInput = document.getElementById('admin-password');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const loginError = document.getElementById('login-error');
    
    togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePasswordBtn.querySelector('i').className = type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    });
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const passwordVal = passwordInput.value;
        const expectedHash = businessConfig.adminPasswordHash || "79b1d9e3285664c318128899d048be76f6db1998f045d325c80c023707b30761"; // Antojalos2026
        
        if (isPHPBackend) {
            try {
                const response = await fetch('api.php?action=login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: passwordVal })
                });
                const result = await response.json();
                
                if (result.status === 'success') {
                    // Save token (which is the password hash)
                    sessionStorage.setItem('admin_token', result.data.token);
                    // Also store password hash in memory just in case
                    businessConfig.adminPasswordHash = result.data.token;
                    showDashboard();
                } else {
                    showLoginError();
                }
            } catch (err) {
                console.error(err);
                // Try client-side fallback check
                verifyLocalPassword(passwordVal);
            }
        } else {
            verifyLocalPassword(passwordVal);
        }
    });
    
    async function verifyLocalPassword(passwordVal) {
        const inputHash = await sha256(passwordVal);
        const expectedHash = businessConfig.adminPasswordHash || "79b1d9e3285664c318128899d048be76f6db1998f045d325c80c023707b30761";
        
        if (inputHash === expectedHash) {
            sessionStorage.setItem('admin_token', expectedHash);
            showDashboard();
        } else {
            showLoginError();
        }
    }
    
    function showLoginError() {
        loginError.style.display = 'flex';
        setTimeout(() => {
            loginError.style.display = 'none';
        }, 5000);
    }
    
    // Logout Action
    document.getElementById('logout-btn').addEventListener('click', async () => {
        if (isPHPBackend) {
            await fetch('api.php?action=logout', { method: 'POST' });
        }
        sessionStorage.removeItem('admin_token');
        window.location.reload();
    });
}

function showDashboard() {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'flex';
    document.body.style.overflow = '';
    
    // Render default view tabs
    renderProductsTable();
    renderCategoriesTable();
    populateCategorySelectors();
}

// Tabs switching handler
function setupTabListeners() {
    const tabs = document.querySelectorAll('.sidebar-tab');
    const panels = document.querySelectorAll('.tab-panel');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            
            tab.classList.add('active');
            activeTab = tab.dataset.tab;
            document.getElementById(`tab-${activeTab}`).classList.add('active');
        });
    });
}

// Populate Category Filters & select options
function populateCategorySelectors() {
    const filterSelect = document.getElementById('admin-category-filter');
    const formSelect = document.getElementById('edit-product-category');
    
    // Clear dynamic options
    filterSelect.innerHTML = '<option value="all">Todas las categorías</option>';
    formSelect.innerHTML = '';
    
    categoriesList.forEach(cat => {
        // Populating sidebar/panel filter selector
        const optFilter = document.createElement('option');
        optFilter.value = cat.id;
        optFilter.textContent = cat.name;
        filterSelect.appendChild(optFilter);
        
        // Populating product edit form selector
        const optForm = document.createElement('option');
        optForm.value = cat.id;
        optForm.textContent = cat.name;
        formSelect.appendChild(optForm);
    });
}

// Toast indicator helper
function showToast(message, isError = false) {
    const toast = document.getElementById('admin-toast');
    const toastIcon = toast.querySelector('.toast-icon');
    const toastMsg = document.getElementById('toast-message');
    
    toastMsg.textContent = message;
    if (isError) {
        toast.style.borderColor = 'var(--danger)';
        toastIcon.className = 'fa-solid fa-triangle-exclamation';
        toastIcon.style.color = 'var(--danger)';
    } else {
        toast.style.borderColor = 'var(--accent)';
        toastIcon.className = 'fa-solid fa-circle-check';
        toastIcon.style.color = 'var(--success)';
    }
    
    toast.classList.add('active');
    setTimeout(() => {
        toast.classList.remove('active');
    }, 3000);
}

// Backup / Export JSON Files helper
document.getElementById('export-db-btn').addEventListener('click', () => {
    downloadJSON(menuItems, 'menu.json');
    downloadJSON(businessConfig, 'config.json');
    showToast('Respaldos JSON descargados.');
});

function downloadJSON(obj, filename) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(obj, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// ==========================================================================
// PRODUCTS CRUD OPERATIONS
// ==========================================================================
function setupProductCRUD() {
    const modal = document.getElementById('product-edit-modal');
    const backdrop = document.getElementById('product-edit-modal-backdrop');
    const closeBtn = document.getElementById('close-product-edit-modal');
    const cancelBtn = document.getElementById('cancel-product-edit-btn');
    const editForm = document.getElementById('product-edit-form');
    
    // Add product button
    document.getElementById('add-product-btn').addEventListener('click', () => {
        openProductModal();
    });
    
    // Close modal actions
    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        currentEditingProduct = null;
    };
    
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    // Search & Filter event listeners
    document.getElementById('admin-product-search').addEventListener('input', renderProductsTable);
    document.getElementById('admin-category-filter').addEventListener('change', renderProductsTable);
    
    // Image uploader preview & file upload listener
    const imgUrlInput = document.getElementById('edit-product-image-url');
    const imgFileInput = document.getElementById('edit-product-image-file');
    const imgPreview = document.getElementById('edit-image-preview');
    
    imgUrlInput.addEventListener('input', (e) => {
        imgPreview.src = e.target.value || '';
    });
    
    imgFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Render local blob preview immediately
        imgPreview.src = URL.createObjectURL(file);
        
        if (isPHPBackend) {
            // Upload to server PHP API
            const token = sessionStorage.getItem('admin_token');
            const formData = new FormData();
            formData.append('image', file);
            
            showToast('Subiendo imagen...');
            
            try {
                const response = await fetch('api.php?action=upload_image', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                
                const result = await response.json();
                if (result.status === 'success') {
                    imgUrlInput.value = result.data.url;
                    imgPreview.src = result.data.url;
                    showToast('Imagen subida con éxito.');
                } else {
                    showToast(result.message || 'Error al subir imagen', true);
                }
            } catch (err) {
                console.error(err);
                showToast('Error de conexión con el servidor al subir imagen', true);
            }
        } else {
            showToast('Modo local: la imagen se mostrará usando vista previa local temporal.', false);
            // Save base64 data url for mockup local database
            const reader = new FileReader();
            reader.onloadend = () => {
                imgUrlInput.value = reader.result;
            };
            reader.readAsDataURL(file);
        }
    });
    
    // Modifier dynamic row creator inside Product Modal
    document.getElementById('add-modifier-group-btn').addEventListener('click', () => {
        addModifierGroupEditorCard();
    });
    
    // Save Product Form Submission
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('edit-product-id').value;
        const name = document.getElementById('edit-product-name').value.trim();
        const category = document.getElementById('edit-product-category').value;
        const price = parseFloat(document.getElementById('edit-product-price').value) || 0;
        const description = document.getElementById('edit-product-description').value.trim();
        const image = imgUrlInput.value.trim();
        
        // Rebuild modifiers array
        const modifiers = collectModifiersFromEditor();
        
        const productData = {
            id: id || 'prod_' + Date.now(),
            name,
            category,
            price,
            description,
            image,
            modifiers
        };
        
        if (id) {
            // Edit mode
            const index = menuItems.findIndex(item => item.id === id);
            if (index > -1) {
                menuItems[index] = productData;
            }
        } else {
            // Create mode
            menuItems.push(productData);
        }
        
        const success = await saveMenuItems();
        if (success) {
            showToast('Producto guardado correctamente.');
            closeModal();
            renderProductsTable();
        } else {
            showToast('No se pudo guardar el producto.', true);
        }
    });
}

// Render Products Table with Filters & Search
function renderProductsTable() {
    const tbody = document.getElementById('admin-products-table-body');
    const filterCategory = document.getElementById('admin-category-filter').value;
    const searchVal = document.getElementById('admin-product-search').value.toLowerCase();
    
    tbody.innerHTML = '';
    
    const filtered = menuItems.filter(item => {
        const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
        const matchesSearch = item.name.toLowerCase().includes(searchVal) || 
                              item.description.toLowerCase().includes(searchVal);
        return matchesCategory && matchesSearch;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No se encontraron productos.</td></tr>`;
        return;
    }
    
    filtered.forEach(item => {
        const tr = document.createElement('tr');
        
        // Category Label
        const categoryObj = categoriesList.find(c => c.id === item.category);
        const categoryName = categoryObj ? categoryObj.name : item.category;
        
        // Modifiers preview
        const modCount = item.modifiers ? item.modifiers.length : 0;
        let modText = 'Sin modificadores';
        if (modCount > 0) {
            const list = item.modifiers.map(m => {
                const limit = m.max_choices ? ` (max: ${m.max_choices})` : '';
                return `${m.name}${limit}`;
            });
            modText = list.join(', ');
        }
        
        const imgUrl = item.image ? item.image : 'https://placehold.co/50x50/0b132b/ff5722?text=AJ';
        
        tr.innerHTML = `
            <td><img src="${imgUrl}" alt="${item.name}" class="table-img" onerror="this.src='https://placehold.co/50x50/0b132b/ff5722?text=AJ';"></td>
            <td style="font-weight: 700;">${item.name}</td>
            <td><span class="badge">${categoryName}</span></td>
            <td style="font-weight: 700; color: var(--accent-hover);">$${parseFloat(item.price).toFixed(2)}</td>
            <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${modText}</td>
            <td>
                <div class="table-actions">
                    <button class="action-icon-btn edit" data-id="${item.id}" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="action-icon-btn delete" data-id="${item.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        
        // Bind Actions
        tr.querySelector('.edit').addEventListener('click', () => openProductModal(item));
        tr.querySelector('.delete').addEventListener('click', () => deleteProduct(item.id));
        
        tbody.appendChild(tr);
    });
}

// Save menu items array back to server or local storage
async function saveMenuItems() {
    if (isPHPBackend) {
        try {
            const token = sessionStorage.getItem('admin_token');
            const res = await fetch('api.php?action=save_menu', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(menuItems)
            });
            const result = await res.json();
            return result.status === 'success';
        } catch (e) {
            console.error(e);
            return saveLocalMenuFallback();
        }
    } else {
        return saveLocalMenuFallback();
    }
}

function saveLocalMenuFallback() {
    localStorage.setItem('antojalos_menu_db', JSON.stringify(menuItems));
    return true;
}

// Open and load product edit modal
function openProductModal(product = null) {
    const modal = document.getElementById('product-edit-modal');
    const form = document.getElementById('product-edit-form');
    
    form.reset();
    document.getElementById('product-modifiers-editor-list').innerHTML = '';
    
    if (product) {
        // Edit mode
        currentEditingProduct = product;
        document.getElementById('product-modal-title').textContent = "Editar Producto";
        document.getElementById('edit-product-id').value = product.id;
        document.getElementById('edit-product-name').value = product.name;
        document.getElementById('edit-product-category').value = product.category;
        document.getElementById('edit-product-price').value = product.price;
        document.getElementById('edit-product-description').value = product.description;
        
        document.getElementById('edit-product-image-url').value = product.image || '';
        document.getElementById('edit-image-preview').src = product.image || '';
        
        // Render modifiers
        if (product.modifiers && product.modifiers.length > 0) {
            product.modifiers.forEach(mod => {
                addModifierGroupEditorCard(mod);
            });
        }
    } else {
        // Create mode
        currentEditingProduct = null;
        document.getElementById('product-modal-title').textContent = "Nuevo Producto";
        document.getElementById('edit-product-id').value = '';
        document.getElementById('edit-image-preview').src = '';
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Delete Product Action
async function deleteProduct(id) {
    const item = menuItems.find(i => i.id === id);
    if (!item) return;
    
    if (confirm(`¿Estás seguro de que deseas eliminar "${item.name}"?`)) {
        menuItems = menuItems.filter(i => i.id !== id);
        const success = await saveMenuItems();
        if (success) {
            showToast('Producto eliminado.');
            renderProductsTable();
        } else {
            showToast('Error al eliminar producto.', true);
        }
    }
}

// ==========================================================================
// MODIFIERS EDITOR BUILDER
// ==========================================================================
function addModifierGroupEditorCard(modifierData = null) {
    const listContainer = document.getElementById('product-modifiers-editor-list');
    const cardId = 'mod_card_' + Date.now() + Math.random().toString(36).substr(2, 4);
    
    const card = document.createElement('div');
    card.className = 'mod-group-editor-card';
    card.id = cardId;
    
    const defaultData = modifierData || {
        id: 'mod_' + Math.random().toString(36).substr(2, 6),
        name: '',
        type: 'select',
        required: true,
        max_choices: 1,
        options: []
    };
    
    card.innerHTML = `
        <button type="button" class="remove-mod-group-btn" title="Eliminar Grupo"><i class="fa-solid fa-trash"></i></button>
        
        <input type="hidden" class="mod-group-id" value="${defaultData.id}">
        
        <div class="mod-settings-grid">
            <div class="form-group">
                <label>Nombre del Grupo (Ej. Sabores)</label>
                <input type="text" class="mod-group-name" value="${defaultData.name}" required placeholder="Ej. Elegir Salsa">
            </div>
            <div class="form-group">
                <label>Tipo de Control</label>
                <select class="mod-group-type">
                    <option value="select" ${defaultData.type === 'select' ? 'selected' : ''}>Radio (1 Opción)</option>
                    <option value="checkbox" ${defaultData.type === 'checkbox' ? 'selected' : ''}>Checkbox (Múltiple)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Límite Selecciones</label>
                <input type="number" class="mod-group-max-choices" min="1" value="${defaultData.max_choices || 1}">
            </div>
        </div>
        
        <div class="always-open-toggle" style="margin-bottom: 12px; border:none; padding:0;">
            <label class="checkbox-container">
                <input type="checkbox" class="mod-group-required" ${defaultData.required ? 'checked' : ''}>
                <span class="checkmark"></span>
                <strong>Obligatorio seleccionar al menos una opción</strong>
            </label>
        </div>
        
        <div class="mod-options-editor-area">
            <h5>Opciones de este grupo</h5>
            <div class="mod-options-inputs-list">
                <!-- Option rows here -->
            </div>
            <button type="button" class="admin-btn-secondary btn-sm add-option-row-btn" style="margin-top: 10px;">
                <i class="fa-solid fa-plus-circle"></i> Agregar Opción
            </button>
        </div>
    `;
    
    const optionsContainer = card.querySelector('.mod-options-inputs-list');
    
    // Add default options if editing
    if (defaultData.options && defaultData.options.length > 0) {
        defaultData.options.forEach(opt => {
            addModifierOptionRow(optionsContainer, opt);
        });
    } else {
        // Add one initial empty row
        addModifierOptionRow(optionsContainer);
    }
    
    // Bind Delete Group Event
    card.querySelector('.remove-mod-group-btn').addEventListener('click', () => {
        card.remove();
    });
    
    // Bind Add Option Row Event
    card.querySelector('.add-option-row-btn').addEventListener('click', () => {
        addModifierOptionRow(optionsContainer);
    });
    
    // Auto toggle max choices based on type select
    const typeSelect = card.querySelector('.mod-group-type');
    const maxChoicesInput = card.querySelector('.mod-group-max-choices');
    
    typeSelect.addEventListener('change', () => {
        if (typeSelect.value === 'select') {
            maxChoicesInput.value = 1;
            maxChoicesInput.disabled = true;
        } else {
            maxChoicesInput.disabled = false;
            maxChoicesInput.value = 2; // Default starting multiple limit
        }
    });
    
    // Trigger initial select type disable check
    if (defaultData.type === 'select') {
        maxChoicesInput.disabled = true;
    }
    
    listContainer.appendChild(card);
}

function addModifierOptionRow(container, optionData = null) {
    const row = document.createElement('div');
    row.className = 'mod-option-edit-row';
    
    const defaultOpt = optionData || { name: '', price: 0 };
    
    row.innerHTML = `
        <input type="text" class="mod-option-name" value="${defaultOpt.name}" required placeholder="Nombre (ej. Queso Extra)">
        <input type="number" class="mod-option-price" value="${defaultOpt.price}" min="0" step="0.5" required placeholder="Precio (+)">
        <button type="button" class="action-icon-btn delete remove-option-row-btn" title="Eliminar Opción"><i class="fa-solid fa-circle-minus"></i></button>
    `;
    
    row.querySelector('.remove-option-row-btn').addEventListener('click', () => {
        row.remove();
    });
    
    container.appendChild(row);
}

// Collect modifiers editor details and convert to JSON structure
function collectModifiersFromEditor() {
    const modifiers = [];
    const groupCards = document.querySelectorAll('.mod-group-editor-card');
    
    groupCards.forEach(card => {
        const id = card.querySelector('.class-id')?.value || card.querySelector('.mod-group-id').value;
        const name = card.querySelector('.mod-group-name').value.trim();
        const type = card.querySelector('.mod-group-type').value;
        const max_choices = parseInt(card.querySelector('.mod-group-max-choices').value) || 1;
        const required = card.querySelector('.mod-group-required').checked;
        
        const options = [];
        const optionRows = card.querySelectorAll('.mod-option-edit-row');
        
        optionRows.forEach(row => {
            const optName = row.querySelector('.mod-option-name').value.trim();
            const optPrice = parseFloat(row.querySelector('.mod-option-price').value) || 0;
            
            if (optName !== '') {
                options.push({
                    name: optName,
                    price: optPrice
                });
            }
        });
        
        if (name !== '' && options.length > 0) {
            modifiers.push({
                id,
                name,
                type,
                required,
                max_choices,
                options
            });
        }
    });
    
    return modifiers;
}


// ==========================================================================
// CATEGORIES CRUD OPERATIONS
// ==========================================================================
function setupCategoryCRUD() {
    const modal = document.getElementById('category-edit-modal');
    const backdrop = document.getElementById('category-edit-modal-backdrop');
    const closeBtn = document.getElementById('close-category-edit-modal');
    const cancelBtn = document.getElementById('cancel-category-edit-btn');
    const editForm = document.getElementById('category-edit-form');
    
    // Add category button
    document.getElementById('add-category-btn').addEventListener('click', () => {
        openCategoryModal();
    });
    
    // Close modal actions
    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        currentEditingCategory = null;
    };
    
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    // Save Category Form Submit
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const key = document.getElementById('edit-category-key').value;
        const name = document.getElementById('edit-category-name').value.trim();
        const icon = document.getElementById('edit-category-icon').value.trim();
        
        const id = key || name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
        
        const categoryData = { id, name, icon };
        
        if (key) {
            // Edit mode
            const index = categoriesList.findIndex(c => c.id === key);
            if (index > -1) {
                categoriesList[index] = categoryData;
            }
        } else {
            // Create mode
            // Check duplicates
            if (categoriesList.some(c => c.id === id)) {
                alert('Ya existe una categoría con un ID similar.');
                return;
            }
            categoriesList.push(categoryData);
        }
        
        businessConfig.categories = categoriesList;
        const success = await saveConfig();
        
        if (success) {
            showToast('Categoría guardada.');
            closeModal();
            renderCategoriesTable();
            populateCategorySelectors();
        } else {
            showToast('Error al guardar la categoría.', true);
        }
    });
}

// Render categories rows list
function renderCategoriesTable() {
    const tbody = document.getElementById('admin-categories-table-body');
    tbody.innerHTML = '';
    
    categoriesList.forEach(cat => {
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td style="font-family: monospace; font-size: 0.85rem;">${cat.id}</td>
            <td style="font-weight: 700;">${cat.name}</td>
            <td><span class="badge"><i class="fa-solid ${cat.icon}"></i> ${cat.icon}</span></td>
            <td>
                <div class="table-actions">
                    <button class="action-icon-btn edit" data-key="${cat.id}"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="action-icon-btn delete" data-key="${cat.id}"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        
        tr.querySelector('.edit').addEventListener('click', () => openCategoryModal(cat));
        tr.querySelector('.delete').addEventListener('click', () => deleteCategory(cat.id));
        
        tbody.appendChild(tr);
    });
}

function openCategoryModal(category = null) {
    const modal = document.getElementById('category-edit-modal');
    const form = document.getElementById('category-edit-form');
    
    form.reset();
    
    if (category) {
        currentEditingCategory = category;
        document.getElementById('category-modal-title').textContent = "Editar Categoría";
        document.getElementById('edit-category-key').value = category.id;
        document.getElementById('edit-category-name').value = category.name;
        document.getElementById('edit-category-icon').value = category.icon;
    } else {
        currentEditingCategory = null;
        document.getElementById('category-modal-title').textContent = "Nueva Categoría";
        document.getElementById('edit-category-key').value = '';
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

async function deleteCategory(key) {
    const cat = categoriesList.find(c => c.id === key);
    if (!cat) return;
    
    // Check if category is used in products
    const inUse = menuItems.some(item => item.category === key);
    if (inUse) {
        alert(`No puedes eliminar la categoría "${cat.name}" porque tiene productos asociados. Cambia la categoría de los productos primero.`);
        return;
    }
    
    if (confirm(`¿Estás seguro de eliminar la categoría "${cat.name}"?`)) {
        categoriesList = categoriesList.filter(c => c.id !== key);
        businessConfig.categories = categoriesList;
        
        const success = await saveConfig();
        if (success) {
            showToast('Categoría eliminada.');
            renderCategoriesTable();
            populateCategorySelectors();
        } else {
            showToast('Error al eliminar la categoría.', true);
        }
    }
}


// ==========================================================================
// CONFIGURATION AND HOURS SETTINGS
// ==========================================================================
function setupConfigForm() {
    const configForm = document.getElementById('config-form');
    const alwaysOpenCheck = document.getElementById('config-always-open');
    const weeklyHoursContainer = document.getElementById('weekly-hours-container');
    
    // Load config state in form fields
    document.getElementById('config-business-name').value = businessConfig.businessName || 'Antó-Jalos';
    document.getElementById('config-phone').value = businessConfig.whatsappPhone || '524741342246';
    document.getElementById('config-delivery-cost').value = parseFloat(businessConfig.deliveryCost) || 0;
    alwaysOpenCheck.checked = businessConfig.schedule ? businessConfig.schedule.alwaysOpen : true;
    
    // Hours toggle display logic
    const updateScheduleDisplay = () => {
        const isAlwaysOpen = alwaysOpenCheck.checked;
        if (isAlwaysOpen) {
            weeklyHoursContainer.style.opacity = '0.5';
            weeklyHoursContainer.querySelectorAll('input').forEach(i => i.disabled = true);
        } else {
            weeklyHoursContainer.style.opacity = '1';
            weeklyHoursContainer.querySelectorAll('input').forEach(i => {
                // If the day is enabled, don't disable hours, if not enabled, disable hours
                const dayRow = i.closest('.day-hour-row');
                const isDayEnabled = dayRow.querySelector('.day-enable').checked;
                
                if (i.classList.contains('day-enable')) {
                    i.disabled = false;
                } else {
                    i.disabled = !isDayEnabled;
                }
            });
        }
    };
    
    alwaysOpenCheck.addEventListener('change', updateScheduleDisplay);
    
    // Load Schedule details in table
    const schedule = businessConfig.schedule || DEFAULT_CONFIG.schedule;
    
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
        const dayRow = weeklyHoursContainer.querySelector(`.day-hour-row[data-day="${day}"]`);
        if (!dayRow) return;
        
        const dayData = schedule.days ? schedule.days[day] : null;
        const dayEnable = dayRow.querySelector('.day-enable');
        const timeStart = dayRow.querySelector('.time-start');
        const timeEnd = dayRow.querySelector('.time-end');
        
        if (dayData) {
            dayEnable.checked = dayData.enabled;
            timeStart.value = dayData.start || "18:00";
            timeEnd.value = dayData.end || "23:30";
        } else {
            dayEnable.checked = true;
            timeStart.value = "18:00";
            timeEnd.value = "23:30";
        }
        
        // Add change listener to day check toggles
        dayEnable.addEventListener('change', () => {
            const isDayEnabled = dayEnable.checked;
            dayRow.classList.toggle('disabled', !isDayEnabled);
            timeStart.disabled = !isDayEnabled;
            timeEnd.disabled = !isDayEnabled;
        });
        
        // Initial day check row disabled class state
        dayRow.classList.toggle('disabled', !dayEnable.checked);
    });
    
    updateScheduleDisplay();
    
    // Handle Save Config submit
    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const businessName = document.getElementById('config-business-name').value.trim();
        const whatsappPhone = document.getElementById('config-phone').value.trim();
        const deliveryCost = parseFloat(document.getElementById('config-delivery-cost').value) || 0;
        const newPassword = document.getElementById('config-new-password').value.trim();
        
        const alwaysOpen = alwaysOpenCheck.checked;
        const daysData = {};
        
        days.forEach(day => {
            const dayRow = weeklyHoursContainer.querySelector(`.day-hour-row[data-day="${day}"]`);
            if (!dayRow) return;
            
            daysData[day] = {
                enabled: dayRow.querySelector('.day-enable').checked,
                start: dayRow.querySelector('.time-start').value,
                end: dayRow.querySelector('.time-end').value
            };
        });
        
        const updatedConfig = {
            ...businessConfig,
            businessName,
            whatsappPhone,
            deliveryCost,
            schedule: {
                alwaysOpen,
                timezone: 'America/Mexico_City',
                days: daysData
            }
        };
        
        // Add new password if set
        if (newPassword) {
            updatedConfig.newPassword = newPassword; // Handled dynamically in API
            // For local storage fallback
            updatedConfig.adminPasswordHash = await sha256(newPassword);
        }
        
        businessConfig = updatedConfig;
        
        const success = await saveConfig();
        if (success) {
            showToast('Ajustes del negocio guardados correctamente.');
            document.getElementById('config-new-password').value = '';
            
            // If password changed, update local token to avoid automatic logout
            if (newPassword) {
                const newHash = await sha256(newPassword);
                sessionStorage.setItem('admin_token', newHash);
            }
        } else {
            showToast('No se pudo guardar la configuración.', true);
        }
    });
}

// Save config JSON to server API or local storage fallback
async function saveConfig() {
    if (isPHPBackend) {
        try {
            const token = sessionStorage.getItem('admin_token');
            const res = await fetch('api.php?action=save_config', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(businessConfig)
            });
            const result = await res.json();
            
            // If they changed password, clean configuration cache locally
            if (businessConfig.newPassword) {
                delete businessConfig.newPassword;
            }
            
            return result.status === 'success';
        } catch (e) {
            console.error(e);
            return saveLocalConfigFallback();
        }
    } else {
        return saveLocalConfigFallback();
    }
}

function saveLocalConfigFallback() {
    localStorage.setItem('antojalos_config_db', JSON.stringify(businessConfig));
    return true;
}
