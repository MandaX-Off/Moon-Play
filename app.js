// Configuración de Supabase
const CONFIG = {
    URL: 'https://htatptgpjzkjztdqlrzm.supabase.co',
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0YXRwdGdwanpranp0ZHFscnptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2Mzc4OTIsImV4cCI6MjA4NTIxMzg5Mn0.Zw2XTBUo1xZNooFhdP3vKgL4IokGor8Xx5ogUxaB5tM'
};

const _supabase = supabase.createClient(CONFIG.URL, CONFIG.ANON_KEY);

let currentUser = null;
let isLoginMode = true;

// --- UTILS ---
function notify(text, isError = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (isError) toast.style.borderLeftColor = '#ef4444';
    toast.innerText = text;
    container.appendChild(toast);
    setTimeout(() => { 
        toast.style.opacity = '0'; 
        setTimeout(() => toast.remove(), 300); 
    }, 4000);
}

function toggleLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.dataset.originalText = btn.innerText;
        btn.innerText = "Procesando...";
        btn.disabled = true;
    } else {
        btn.innerText = btn.dataset.originalText || "Enviar";
        btn.disabled = false;
    }
}

function cerrarModales() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

// --- SISTEMA DE NIVELES (Optimizado con Matemáticas) ---
// Fórmula: XP necesaria para nivel N = N * 100
function obtenerProgreso(totalXP) {
    // Usamos la fórmula de progresión aritmética simplificada
    // Nivel = (sqrt(200 * XP + 2500) + 50) / 100 -> Para escalas complejas
    // Para tu escala simple de nivel * 100:
    let nivel = 1;
    let xpAcumulada = 0;
    
    while (totalXP >= (nivel * 100)) {
        totalXP -= (nivel * 100);
        nivel++;
    }

    const xpNecesaria = nivel * 100;
    const porcentaje = (totalXP / xpNecesaria) * 100;

    return { nivel, xpRestante: totalXP, xpNecesaria, porcentaje };
}

function actualizarUINiveles(xp) {
    const p = obtenerProgreso(xp || 0);
    const elements = {
        level: document.getElementById('lbl-level'),
        xp: document.getElementById('lbl-xp'),
        bar: document.getElementById('bar-xp')
    };
    
    if(elements.level) elements.level.innerText = `Nivel ${p.nivel}`;
    if(elements.xp) elements.xp.innerText = `${Math.floor(p.xpRestante)} / ${p.xpNecesaria} XP`;
    if(elements.bar) elements.bar.style.width = `${p.porcentaje}%`;
}

// --- CORE FUNCTIONS ---
async function refrescarDatosUsuario() {
    if (!currentUser) return;
    const { data, error } = await _supabase.from('usuarios').select('*').eq('id', currentUser.id).single();
    if (!error && data) {
        // IMPORTANTE: Borramos el password antes de guardar en LocalStorage por seguridad
        delete data.password; 
        currentUser = data;
        localStorage.setItem('supabase_user', JSON.stringify(data));
        renderDashboard(data);
    }
}

async function sumarXP(cantidad, mensajeExito) {
    if (!currentUser) return;
    const nuevaXP = (currentUser.xp || 0) + cantidad;

    const { error } = await _supabase
        .from('usuarios')
        .update({ xp: nuevaXP })
        .eq('id', currentUser.id);

    if (!error) {
        await refrescarDatosUsuario();
        notify(mensajeExito);
        cerrarModales();
    } else {
        notify("Error al actualizar XP: " + error.message, true);
    }
}

// --- DASHBOARD ---
function renderDashboard(user) {
    if (!user) return;
    currentUser = user;
    
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('welcome-view').classList.remove('hidden');
    document.getElementById('sidebar').style.display = 'flex';

    document.getElementById('side-name').innerText = user.usuario;
    document.getElementById('side-rank').innerText = user.rango;
    
    actualizarUINiveles(user.xp);

    const rankLbl = document.getElementById('side-rank');
    const avatar = document.getElementById('avatar-circle');
    const adminP = document.getElementById('admin-panel');

    // Reset styles
    rankLbl.classList.remove('owner-style');
    avatar.classList.remove('owner-style');
    adminP.classList.add('hidden');

    if (user.rango === 'OWNER') {
        rankLbl.classList.add('owner-style');
        avatar.classList.add('owner-style');
        adminP.classList.remove('hidden');
    }
}

// --- INITIALIZATION ---
(async () => {
    const saved = localStorage.getItem('supabase_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        renderDashboard(currentUser);
        // Segundo plano: verificar si los datos cambiaron en la DB
        refrescarDatosUsuario();
    }
})();

// --- AUTH LOGIC ---
document.getElementById('toggle-auth').onclick = () => {
    isLoginMode = !isLoginMode;
    document.getElementById('form-title').innerText = isLoginMode ? "Bienvenido" : "Crea tu Cuenta";
    document.getElementById('btn-main').innerText = isLoginMode ? "Acceder al Panel" : "Registrarse ahora";
};

document.getElementById('btn-main').onclick = async () => {
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value.trim();
    
    if (!u || !p) return notify("Completa todos los campos", true);
    toggleLoading('btn-main', true);

    try {
        if (isLoginMode) {
            const { data, error } = await _supabase.from('usuarios')
                .select('*')
                .eq('usuario', u)
                .eq('password', p)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                delete data.password; // Seguridad
                localStorage.setItem('supabase_user', JSON.stringify(data));
                renderDashboard(data);
                notify("¡Hola de nuevo!");
            } else {
                notify("Usuario o contraseña incorrectos", true);
            }
        } else {
            const { data: exist } = await _supabase.from('usuarios').select('id').eq('usuario', u).maybeSingle();
            if (exist) {
                notify("El nombre de usuario ya está pillado", true);
            } else {
                const { error } = await _supabase.from('usuarios').insert([
                    { usuario: u, password: p, rango: 'USUARIO', xp: 0 }
                ]);
                if (error) throw error;
                notify("¡Cuenta creada! Ya puedes entrar.");
                isLoginMode = true;
                document.getElementById('toggle-auth').click();
            }
        }
    } catch (err) { 
        notify("Ups: " + err.message, true); 
    } finally { 
        toggleLoading('btn-main', false); 
    }
};

// --- MODAL EVENTS ---
document.getElementById('btn-open-settings').onclick = () => {
    document.getElementById('new-username').value = currentUser.usuario;
    document.getElementById('settings-modal').style.display = 'flex';
};
document.getElementById('btn-open-codes').onclick = () => {
    document.getElementById('input-code').value = "";
    document.getElementById('codes-modal').style.display = 'flex';
};
document.getElementById('btn-close-settings').onclick = cerrarModales;
document.getElementById('btn-close-codes').onclick = cerrarModales;

document.getElementById('btn-update').onclick = async () => {
    const nuevoU = document.getElementById('new-username').value.trim();
    const nuevaP = document.getElementById('new-password').value.trim();
    if (!nuevoU) return notify("El nombre no puede estar vacío", true);
    
    toggleLoading('btn-update', true);
    try {
        const updateData = { usuario: nuevoU };
        if (nuevaP) updateData.password = nuevaP;

        const { error } = await _supabase.from('usuarios').update(updateData).eq('id', currentUser.id);
        if (error) throw error;

        notify("Perfil actualizado con éxito ✨");
        await refrescarDatosUsuario();
        setTimeout(cerrarModales, 500);
    } catch (e) { 
        notify("Error al actualizar: " + e.message, true); 
    } finally { 
        toggleLoading('btn-update', false); 
    }
};

// --- REDEEM CODES ---
document.getElementById('btn-redeem-code').onclick = async () => {
    const input = document.getElementById('input-code').value.trim().toUpperCase();
    if (!input) return notify("Introduce un código", true);

    toggleLoading('btn-redeem-code', true);

    try {
        // 1. Verificar existencia
        const { data: codigo, error: e1 } = await _supabase.from('codigos').select('*').eq('codigo', input).maybeSingle();
        if (e1 || !codigo) throw new Error("Ese código no existe");

        // 2. Verificar si ya se usó
        const { data: usado, error: e2 } = await _supabase.from('codigos_usados')
            .select('*').eq('usuario_id', currentUser.id).eq('codigo_id', codigo.id).maybeSingle();
        if (usado) throw new Error("Ya usaste este código");

        // 3. Registrar uso y sumar XP
        const { error: e3 } = await _supabase.from('codigos_usados').insert([{ usuario_id: currentUser.id, codigo_id: codigo.id }]);
        if (e3) throw e3;

        await sumarXP(codigo.xp_reward, `¡Canjeado! +${codigo.xp_reward} XP`);
    } catch (err) {
        notify(err.message, true);
    } finally {
        toggleLoading('btn-redeem-code', false);
    }
};

document.getElementById('btn-logout-side').onclick = () => {
    localStorage.removeItem('supabase_user');
    location.reload();
};

if(document.getElementById('btn-fetch')) {
    document.getElementById('btn-fetch').onclick = async () => {
        const out = document.getElementById('output');
        out.innerText = "Consultando base de datos...";
        const { data } = await _supabase.from('usuarios').select('id, usuario, rango, xp').order('xp', { ascending: false });
        out.innerText = JSON.stringify(data, null, 2);
    };
}