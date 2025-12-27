// js/app.js

// 1. IMPORTAMOS LA BASE DE DATOS
import { db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

let currentUserRole = 'user';
let currentCategory = null;
let localItems = []; // Cache local simple para búsquedas

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    renderDashboard();
    setupEventListeners();
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
    document.getElementById('btnGenCode').addEventListener('click', generateCode);
    document.getElementById('btnSaveItem').addEventListener('click', saveItem);

    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => closeModal(e.target.dataset.target));
    });
}

// --- CORE FUNCTIONS ---
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
    document.getElementById('listView').style.display = 'none';
    document.getElementById('searchInput').value = '';
}

// --- LECTURA DESDE FIREBASE ---
async function openCategory(catId) {
    currentCategory = catId;
    const cat = categories.find(c => c.id === catId);
    document.getElementById('categoryTitle').innerText = "Cargando...";
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('listView').style.display = 'block';
    
    // Limpiar contenedor
    const container = document.getElementById('itemsContainer');
    container.innerHTML = '<p style="text-align:center; margin-top:20px;">Cargando datos...</p>';

    try {
        // Consulta a Firebase: "Dame documentos donde la categoria sea X"
        const q = query(collection(db, "medicamentos"), where("cat", "==", catId));
        const querySnapshot = await getDocs(q);
        
        localItems = []; // Limpiamos cache local
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
        
        let html = `<div class="item-title">${item.title}</div><div class="item-content">${item.content}</div>`;
        div.innerHTML = html;

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
    
    // NOTA: Firebase no tiene búsqueda nativa de "texto completo" gratuita fácil.
    // Estrategia: Si hay texto, buscamos en TODOS los documentos (o usamos cache si ya cargamos).
    // Para esta versión PWA simple, descargaremos todo si busca algo (Cuidado con bases de datos gigantes)
    
    if (!queryText) {
        if (currentCategory) openCategory(currentCategory);
        else renderDashboard();
        return;
    }

    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('listView').style.display = 'block';
    document.getElementById('categoryTitle').innerText = "Buscando...";

    // Traer TODO para buscar en memoria (Solución rápida para demos)
    // En producción se usaría Algolia o ElasticSearch
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

// --- AUTH (Simulada, igual que antes) ---
function validateCode(code) {
    if (code === "1234") return 'admin';
    if (code === "5678") return 'regente';
    try {
        const decoded = atob(code);
        const [role, date] = decoded.split('|');
        const today = new Date().toISOString().split('T')[0];
        if (date === today) return role;
    } catch (e) {}
    return null;
}

function login() {
    const code = document.getElementById('accessCode').value;
    const role = validateCode(code);
    if (role) {
        currentUserRole = role;
        showToast(`Bienvenido ${role.toUpperCase()}`);
        document.getElementById('accessCode').value = '';
        document.getElementById('loginBtn').style.color = 'var(--success)';
        document.getElementById('loginBtn').innerHTML = '<i class="fas fa-user-check"></i>';
        closeModal('loginModal');
        if (currentCategory) openCategory(currentCategory); // Recargar para ver botones
    } else {
        showToast("Código inválido");
    }
}

function logout() {
    currentUserRole = 'user';
    document.getElementById('loginBtn').style.color = 'white';
    document.getElementById('loginBtn').innerHTML = '<i class="fas fa-user-lock"></i>';
    document.getElementById('addFab').style.display = 'none';
    closeModal('loginModal');
    showDashboard();
    showToast("Sesión cerrada");
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
    } else {
        formDiv.classList.add('hidden');
        sessionDiv.classList.remove('hidden');
        document.getElementById('roleLabel').innerText = currentUserRole === 'admin' ? 'Súper Usuario' : 'Regente';
        if (currentUserRole === 'admin') {
            adminDiv.classList.remove('hidden');
            document.getElementById('codeDisplay').innerText = '';
        } else {
            adminDiv.classList.add('hidden');
        }
    }
}

function generateCode() {
    const today = new Date().toISOString().split('T')[0];
    const token = btoa(`regente|${today}`);
    document.getElementById('codeDisplay').innerText = token;
    showToast("Código temporal generado");
}

// --- CRUD CON FIREBASE ---
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
            // EDITAR en Firebase
            const itemRef = doc(db, "medicamentos", id);
            await updateDoc(itemRef, {
                title: title,
                content: content
            });
        } else {
            // CREAR en Firebase
            await addDoc(collection(db, "medicamentos"), {
                cat: cat,
                title: title,
                content: content,
                createdAt: new Date()
            });
        }
        
        closeModal('editModal');
        openCategory(cat); // Recargar lista
        showToast("Guardado en la Nube");

    } catch (e) {
        console.error("Error guardando: ", e);
        showToast("Error al guardar");
    } finally {
        document.getElementById('btnSaveItem').innerText = "Guardar";
        document.getElementById('btnSaveItem').disabled = false;
    }
}

async function deleteItem(id) {
    if (confirm("¿Eliminar este registro permanentemente?")) {
        try {
            await deleteDoc(doc(db, "medicamentos", id));
            openCategory(currentCategory); // Recargar
            showToast("Eliminado");
        } catch (e) {
            console.error("Error borrando: ", e);
            showToast("Error al eliminar");
        }
    }
}

// --- UTILS & PWA ---
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

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
            .catch(err => console.error('Error SW:', err));
    }
}