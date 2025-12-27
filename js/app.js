// js/app.js

// 1. IMPORTAMOS BASE DE DATOS Y AUTH
import { db, auth } from './firebase-config.js'; 
import { 
    collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, getDoc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- DATOS Y ESTADO ---
const categories = [
    { id: 'pediatria', name: 'Dosis Pediátricas', icon: 'fa-baby' },
    { id: 'adultos', name: 'Dosis Adultos', icon: 'fa-user' },
    { id: 'antibioticos', name: 'Dosis Antibióticos', icon: 'fa-capsules' },
    { id: 'presentacion', name: 'Presentación Meds', icon: 'fa-pills' },
    { id: 'embarazo', name: 'Med. Embarazo', icon: 'fa-person-pregnant' },
    { id: 'compra', name: 'Pacientes Compra', icon: 'fa-file-invoice-dollar' },
    { id: 'stock', name: 'Sectores Stock', icon: 'fa-boxes-stacked' },
    { id: 'siglas', name: 'Siglas Cómputo', icon: 'fa-desktop' },
    { id: 'legal', name: 'Resp. Legal', icon: 'fa-scale-balanced' },
    { id: 'ancianos', name: 'Hogares Ancianos', icon: 'fa-house-user' },
    { id: 'colores', name: 'Colores Operativos', icon: 'fa-palette' }
];

let currentUserRole = 'user'; // user, regente, admin
let currentCategory = null;
let localItems = []; 

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    renderDashboard();
    setupEventListeners();
    monitorAuthState(); // Iniciamos el monitor de sesión
    registerServiceWorker();
});

function setupEventListeners() {
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('loginBtn').addEventListener('click', openLogin);
    document.getElementById('searchInput').addEventListener('keyup', globalSearch);
    document.getElementById('backBtn').addEventListener('click', showDashboard);
    document.getElementById('addFab').addEventListener('click', () => openEditModal());
    document.getElementById('btnLoginAction').addEventListener('click', login);
    document.getElementById('btnLogoutAction').addEventListener('click', logout);
    document.getElementById('btnSaveItem').addEventListener('click', saveItem);
    
    // Listener para guardar usuario desde el panel de admin
    document.getElementById('btnSaveUser').addEventListener('click', saveUserPermission);

    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => closeModal(e.target.dataset.target));
    });
}

// --- AUTENTICACIÓN Y SEGURIDAD REAL ---

// 1. Monitorear estado y verificar permisos en BD
function monitorAuthState() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Usuario logueado en Firebase, ahora verificamos permisos en Firestore
            try {
                const userRef = doc(db, "usuarios_permitidos", user.email);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    const data = userSnap.data();
                    
                    // A. Verificar si está activo manualmente
                    if (!data.activo) {
                        alert("Tu usuario ha sido desactivado por el administrador.");
                        logout();
                        return;
                    }

                    // B. Verificar fecha de vencimiento
                    const today = new Date().toISOString().split('T')[0];
                    if (data.vencimiento < today) {
                        alert(`Tu acceso venció el día ${data.vencimiento}. Contacta al administrador.`);
                        logout();
                        return;
                    }

                    // C. Asignar rol real (Normalizado a minúsculas para evitar errores)
                    currentUserRole = data.rol.toLowerCase().trim();
                    console.log(`Logueado como: ${currentUserRole}`);
                    updateUILoginState(true);

                } else {
                    // Usuario autenticado en Firebase pero NO está en la lista blanca
                    alert("No tienes permisos asignados en este sistema.");
                    logout(); 
                }
            } catch (error) {
                console.error("Error verificando permisos:", error);
                logout();
            }
        } else {
            // Usuario desconectado
            currentUserRole = 'user';
            updateUILoginState(false);
        }
    });
}

// 2. Iniciar Sesión
async function login() {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;

    if(!email || !pass) return showToast("Faltan datos");

    document.getElementById('btnLoginAction').innerText = "Verificando...";
    document.getElementById('btnLoginAction').disabled = true;

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        showToast("Verificando permisos...");
        closeModal('loginModal');
    } catch (error) {
        console.error(error);
        if(error.code === 'auth/invalid-credential') showToast("Correo o contraseña incorrectos");
        else showToast("Error de acceso");
    } finally {
        document.getElementById('btnLoginAction').innerText = "Entrar";
        document.getElementById('btnLoginAction').disabled = false;
    }
}

// 3. Cerrar Sesión
async function logout() {
    try {
        await signOut(auth);
        showToast("Sesión cerrada");
        closeModal('loginModal');
        // Ocultar panel de admin si estaba abierto
        const adminPanel = document.getElementById('adminPanel');
        adminPanel.classList.add('hidden');
        adminPanel.style.display = 'none';
        
        showDashboard();
    } catch (error) {
        console.error(error);
    }
}

// 4. Actualizar Interfaz según estado
function updateUILoginState(isLoggedIn) {
    const loginBtn = document.getElementById('loginBtn');
    if (isLoggedIn) {
        loginBtn.style.color = 'var(--success)';
        loginBtn.innerHTML = '<i class="fas fa-user-check"></i>';
        
        // Si estamos viendo una lista, refrescar para mostrar botones de editar
        if(currentCategory) openCategory(currentCategory);
    } else {
        loginBtn.style.color = 'white';
        loginBtn.innerHTML = '<i class="fas fa-user-lock"></i>';
        document.getElementById('addFab').style.display = 'none';
        
        // Si estábamos editando, refrescar para ocultar botones
        if(currentCategory) openCategory(currentCategory);
    }
}

function openLogin() {
    const modal = document.getElementById('loginModal');
    const formDiv = document.getElementById('loginForm');
    const sessionDiv = document.getElementById('sessionInfo');
    const adminDiv = document.getElementById('adminTools');
    
    modal.style.display = 'flex';

    if (currentUserRole === 'user') {
        formDiv.classList.remove('hidden');
        sessionDiv.classList.add('hidden');
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
    } else {
        formDiv.classList.add('hidden');
        sessionDiv.classList.remove('hidden');
        document.getElementById('roleLabel').innerText = currentUserRole === 'admin' ? 'Súper Usuario' : 'Regente';
        
        // Mostrar herramientas de admin SOLO si es admin
        if(currentUserRole === 'admin') {
            adminDiv.classList.remove('hidden');
        } else {
            adminDiv.classList.add('hidden');
        }
    }
}

// --- GESTIÓN DE USUARIOS (PANEL ADMIN) ---

// [CORREGIDO] Hacemos global la función y forzamos el display
window.openAdminPanel = async function() {
    closeModal('loginModal');
    
    // Ocultar otras vistas
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('listView').style.display = 'none';
    
    // Mostrar Panel Admin
    const panel = document.getElementById('adminPanel');
    panel.classList.remove('hidden');
    panel.style.display = 'block'; // Forzar visibilidad
    
    loadUsersList();
}

async function loadUsersList() {
    const container = document.getElementById('usersListContainer');
    container.innerHTML = 'Cargando usuarios...';
    
    try {
        const q = query(collection(db, "usuarios_permitidos"));
        const snapshot = await getDocs(q);
        
        container.innerHTML = '';
        if(snapshot.empty) {
            container.innerHTML = '<p>No hay usuarios registrados.</p>';
            return;
        }

        snapshot.forEach(docSnap => {
            const u = docSnap.data();
            const div = document.createElement('div');
            div.className = 'item-card';
            div.style.borderLeftColor = u.rol === 'admin' ? 'var(--primary)' : 'var(--success)';
            
            // Verificar visualmente si está vencido
            const today = new Date().toISOString().split('T')[0];
            const isExpired = u.vencimiento < today;
            const statusColor = isExpired ? 'red' : 'green';
            const statusText = isExpired ? '(VENCIDO)' : '';

            div.innerHTML = `
                <div style="font-weight:bold; display:flex; justify-content:space-between;">
                    <span>${docSnap.id}</span>
                    <span style="font-size:0.8em; background:#eee; padding:2px 6px; border-radius:4px;">${u.rol.toUpperCase()}</span>
                </div>
                <div style="font-size:0.9rem; margin-top:5px;">
                    Vence: <span style="color:${statusColor}; font-weight:bold;">${u.vencimiento} ${statusText}</span>
                </div>
                <div style="margin-top:10px; text-align:right;">
                    <button class="btn btn-danger" style="padding:5px 10px; font-size:0.8rem;" onclick="revokeAccess('${docSnap.id}')">Revocar Acceso</button>
                </div>
            `;
            
            // Llenar formulario al hacer click (excepto en el botón borrar)
            div.addEventListener('click', (e) => {
                if(e.target.tagName !== 'BUTTON') {
                    document.getElementById('adminUserEmail').value = docSnap.id;
                    document.getElementById('adminUserRole').value = u.rol;
                    document.getElementById('adminUserDate').value = u.vencimiento;
                    window.scrollTo(0,0); // Subir para ver el form
                }
            });
            
            container.appendChild(div);
        });
    } catch (e) {
        console.error("Error cargando usuarios:", e);
        container.innerHTML = '<p style="color:red">Error cargando lista.</p>';
    }
}

async function saveUserPermission() {
    const email = document.getElementById('adminUserEmail').value.trim();
    const role = document.getElementById('adminUserRole').value;
    const date = document.getElementById('adminUserDate').value;

    if(!email || !date) return alert("Falta el correo o la fecha de vencimiento");

    const btn = document.getElementById('btnSaveUser');
    btn.innerText = "Guardando...";
    btn.disabled = true;

    try {
        // Guardamos en Firestore usando el email como ID
        await setDoc(doc(db, "usuarios_permitidos", email), {
            rol: role,
            vencimiento: date,
            activo: true
        });
        
        alert("Permisos guardados correctamente.");
        document.getElementById('adminUserEmail').value = ''; // Limpiar
        loadUsersList(); // Recargar lista visual
    } catch (e) {
        console.error(e);
        alert("Error al guardar permiso (Revisa permisos o consola).");
    } finally {
        btn.innerText = "Guardar Acceso";
        btn.disabled = false;
    }
}

// Función global para revocar
window.revokeAccess = async function(email) {
    if(confirm(`¿Estás seguro de quitar el acceso a ${email}?`)) {
        try {
            await deleteDoc(doc(db, "usuarios_permitidos", email));
            loadUsersList();
            showToast("Acceso revocado");
        } catch (e) {
            console.error(e);
            alert("Error al eliminar.");
        }
    }
}

// --- CORE FUNCTIONS (Dashboard, Render, Search) ---
function renderDashboard() {
    const grid = document.getElementById('dashboard');
    grid.innerHTML = '';
    categories.forEach(c => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.innerHTML = `<i class="fas ${c.icon}"></i><span>${c.name}</span>`;
        card.addEventListener('click', () => openCategory(c.id));
        grid.appendChild(card);
    });
    document.getElementById('dashboard').classList.remove('hidden');
    
    // [CORREGIDO] Asegurar que ocultamos el resto
    document.getElementById('listView').style.display = 'none';
    
    const adminPanel = document.getElementById('adminPanel');
    adminPanel.classList.add('hidden'); 
    adminPanel.style.display = 'none'; // Forzar ocultado
    
    document.getElementById('searchInput').value = '';
}

async function openCategory(catId) {
    currentCategory = catId;
    const cat = categories.find(c => c.id === catId);
    document.getElementById('categoryTitle').innerText = "Cargando...";
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('listView').style.display = 'block';
    
    const container = document.getElementById('itemsContainer');
    container.innerHTML = '<p style="text-align:center; margin-top:20px;">Cargando datos...</p>';

    try {
        const q = query(collection(db, "medicamentos"), where("cat", "==", catId));
        const querySnapshot = await getDocs(q);
        localItems = []; 
        querySnapshot.forEach((doc) => {
            localItems.push({ id: doc.id, ...doc.data() });
        });
        document.getElementById('categoryTitle').innerText = cat.name;
        renderItems(localItems);
    } catch (error) {
        console.error("Error cargando datos: ", error);
        container.innerHTML = '<p style="text-align:center; color:red;">Error de conexión</p>';
    }
}

function renderItems(items) {
    const container = document.getElementById('itemsContainer');
    container.innerHTML = '';
    if (items.length === 0) container.innerHTML = '<p style="text-align:center; color:var(--text-sec)">No hay información.</p>';

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.innerHTML = `<div class="item-title">${item.title}</div><div class="item-content">${item.content}</div>`;

        if (currentUserRole === 'admin' || currentUserRole === 'regente') {
            const controls = document.createElement('div');
            controls.className = 'edit-controls';
            
            const btnEdit = document.createElement('button');
            btnEdit.className = 'btn btn-primary';
            btnEdit.style.padding = '5px 10px';
            btnEdit.innerHTML = '<i class="fas fa-edit"></i>';
            btnEdit.onclick = () => openEditModal(item.id);
            controls.appendChild(btnEdit);

            if (currentUserRole === 'admin') {
                const btnDel = document.createElement('button');
                btnDel.className = 'btn btn-danger';
                btnDel.style.padding = '5px 10px';
                btnDel.innerHTML = '<i class="fas fa-trash"></i>';
                btnDel.onclick = () => deleteItem(item.id);
                controls.appendChild(btnDel);
            }
            div.appendChild(controls);
        }
        container.appendChild(div);
    });

    document.getElementById('addFab').style.display = (currentUserRole !== 'user' && currentCategory) ? 'flex' : 'none';
}

function showDashboard() {
    currentCategory = null;
    renderDashboard();
}

async function globalSearch() {
    const queryText = document.getElementById('searchInput').value.toLowerCase();
    if (!queryText) {
        if (currentCategory) openCategory(currentCategory);
        else renderDashboard();
        return;
    }
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('listView').style.display = 'block';
    document.getElementById('categoryTitle').innerText = "Buscando...";

    const querySnapshot = await getDocs(collection(db, "medicamentos"));
    const allDocs = [];
    querySnapshot.forEach((doc) => allDocs.push({ id: doc.id, ...doc.data() }));

    const results = allDocs.filter(item => 
        item.title.toLowerCase().includes(queryText) || 
        item.content.toLowerCase().includes(queryText)
    );
    document.getElementById('categoryTitle').innerText = "Resultados de búsqueda";
    renderItems(results);
}

// --- CRUD ---
function openEditModal(id = null) {
    document.getElementById('editModal').style.display = 'flex';
    if (id) {
        const item = localItems.find(i => i.id === id);
        document.getElementById('editId').value = item.id;
        document.getElementById('editTitle').value = item.title;
        document.getElementById('editContent').value = item.content;
        document.getElementById('editCategory').value = item.cat;
        document.getElementById('modalTitle').innerText = "Editar";
    } else {
        document.getElementById('editId').value = '';
        document.getElementById('editTitle').value = '';
        document.getElementById('editContent').value = '';
        document.getElementById('editCategory').value = currentCategory;
        document.getElementById('modalTitle').innerText = "Nuevo Registro";
    }
}

async function saveItem() {
    const id = document.getElementById('editId').value;
    const title = document.getElementById('editTitle').value;
    const content = document.getElementById('editContent').value;
    const cat = document.getElementById('editCategory').value;

    if (!title || !content) return showToast("Completa los campos");

    document.getElementById('btnSaveItem').innerText = "Guardando...";
    document.getElementById('btnSaveItem').disabled = true;

    try {
        if (id) {
            const itemRef = doc(db, "medicamentos", id);
            await updateDoc(itemRef, { title: title, content: content });
        } else {
            await addDoc(collection(db, "medicamentos"), {
                cat: cat, title: title, content: content, createdAt: new Date()
            });
        }
        closeModal('editModal');
        openCategory(cat);
        showToast("Guardado en la Nube");
    } catch (e) {
        console.error("Error guardando: ", e);
        showToast("Error al guardar (Permisos?)");
    } finally {
        document.getElementById('btnSaveItem').innerText = "Guardar";
        document.getElementById('btnSaveItem').disabled = false;
    }
}

async function deleteItem(id) {
    if (confirm("¿Eliminar este registro permanentemente?")) {
        try {
            await deleteDoc(doc(db, "medicamentos", id));
            openCategory(currentCategory);
            showToast("Eliminado");
        } catch (e) {
            console.error("Error borrando: ", e);
            showToast("Error al eliminar (Permisos?)");
        }
    }
}

// --- UTILS & PWA ---
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function toggleTheme() {
    const body = document.body;
    if (body.getAttribute('data-theme') === 'dark') {
        body.removeAttribute('data-theme');
        document.querySelector('.theme-toggle i').className = 'fas fa-moon';
    } else {
        body.setAttribute('data-theme', 'dark');
        document.querySelector('.theme-toggle i').className = 'fas fa-sun';
    }
}

function showToast(msg) {
    const x = document.getElementById("toast");
    x.innerText = msg;
    x.style.visibility = "visible";
    setTimeout(() => { x.style.visibility = "hidden"; }, 3000);
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('SW Registrado'))
            .catch(err => console.error(err));
    }
}
