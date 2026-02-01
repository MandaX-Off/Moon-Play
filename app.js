// Configuración de Supabase
const CONFIG = {
    URL: 'https://htatptgpjzkjztdqlrzm.supabase.co',
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0YXRwdGdwanpranp0ZHFscnptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2Mzc4OTIsImV4cCI6MjA4NTIxMzg5Mn0.Zw2XTBUo1xZNooFhdP3vKgL4IokGor8Xx5ogUxaB5tM'
};

const _supabase = supabase.createClient(CONFIG.URL, CONFIG.ANON_KEY);

let currentUser = null;
let isLoginMode = true;
let timerInterval = null;

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
    if (timerInterval) clearInterval(timerInterval);
}

// --- SISTEMA DE NIVELES ---
function obtenerProgreso(totalXP) {
    let nivel = 1;
    let tempXP = totalXP;
    
    while (tempXP >= (nivel * 100)) {
        tempXP -= (nivel * 100);
        nivel++;
    }

    const xpNecesaria = nivel * 100;
    const porcentaje = (tempXP / xpNecesaria) * 100;

    return { nivel, xpRestante: tempXP, xpNecesaria, porcentaje };
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
    } else {
        notify("Error al actualizar XP: " + error.message, true);
    }
}

// --- MISIONES Y CONTADORES ---
function actualizarContadores() {
    const ahora = new Date().getTime();
    
    // Misión 12h
    const last12 = currentUser.ultimo_12h ? new Date(currentUser.ultimo_12h).getTime() : 0;
    const diff12 = (12 * 60 * 60 * 1000) - (ahora - last12);
    const btn12 = document.getElementById('btn-claim-12h');
    const txt12 = document.getElementById('timer-12h');

    if (diff12 > 0) {
        btn12.disabled = true;
        txt12.innerText = formatTime(diff12);
    } else {
        btn12.disabled = false;
        txt12.innerText = "LISTO";
    }

    // Misión 24h
    const last24 = currentUser.ultimo_checkin ? new Date(currentUser.ultimo_checkin).getTime() : 0;
    const diff24 = (24 * 60 * 60 * 1000) - (ahora - last24);
    const btn24 = document.getElementById('btn-claim-24h');
    const txt24 = document.getElementById('timer-24h');

    if (diff24 > 0) {
        btn24.disabled = true;
        txt24.innerText = formatTime(diff24);
    } else {
        btn24.disabled = false;
        txt24.innerText = "LISTO";
    }
}

function formatTime(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}h ${m}m ${s}s`;
}

async function reclamarMision(tipo) {
    const btnId = tipo === 12 ? 'btn-claim-12h' : 'btn-claim-24h';
    const xp = tipo === 12 ? 10 : 15;
    const column = tipo === 12 ? 'ultimo_12h' : 'ultimo_checkin';
    const ahora = new Date().toISOString();

    toggleLoading(btnId, true);

    const { error } = await _supabase
        .from('usuarios')
        .update({ [column]: ahora })
        .eq('id', currentUser.id);

    if (!error) {
        await sumarXP(xp, `¡Misión completada! +${xp} XP`);
        actualizarContadores();
    } else {
        notify("Error: " + error.message, true);
    }
    toggleLoading(btnId, false);
}

// --- CLASIFICACIÓN (LEADERBOARD) ---
async function cargarLeaderboard() {
    const listContainer = document.getElementById('leaderboard-list');
    listContainer.innerHTML = "<p style='text-align:center; font-size:0.8rem;'>Cargando tops...</p>";
    
    const { data, error } = await _supabase
        .from('usuarios')
        .select('usuario, xp')
        .gt('xp', 0)
        .order('xp', { ascending: false })
        .limit(100);

    if (error) {
        listContainer.innerHTML = "<p style='color:var(--error); font-size:0.8rem;'>Error al cargar el ranking</p>";
        return;
    }

    if (data.length === 0) {
        listContainer.innerHTML = "<p style='text-align:center; font-size:0.8rem; color:var(--text-muted);'>Aún no hay nadie con XP.</p>";
        return;
    }

    listContainer.innerHTML = "";
    data.forEach((user, index) => {
        const info = obtenerProgreso(user.xp);
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.innerHTML = `
            <span class="rank-number">#${index + 1}</span>
            <span class="rank-name">${user.usuario}</span>
            <span class="rank-xp">Nivel ${info.nivel} (${user.xp} XP)</span>
        `;
        listContainer.appendChild(item);
    });
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
                delete data.password;
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
document.getElementById('btn-open-leaderboard').onclick = () => {
    document.getElementById('leaderboard-modal').style.display = 'flex';
    cargarLeaderboard();
};
document.getElementById('btn-open-missions').onclick = () => {
    document.getElementById('missions-modal').style.display = 'flex';
    actualizarContadores();
    timerInterval = setInterval(actualizarContadores, 1000);
};

document.getElementById('btn-close-settings').onclick = cerrarModales;
document.getElementById('btn-close-codes').onclick = cerrarModales;
document.getElementById('btn-close-leaderboard').onclick = cerrarModales;
document.getElementById('btn-close-missions').onclick = cerrarModales;

document.getElementById('btn-claim-12h').onclick = () => reclamarMision(12);
document.getElementById('btn-claim-24h').onclick = () => reclamarMision(24);

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
        const { data: codigo, error: e1 } = await _supabase.from('codigos').select('*').eq('codigo', input).maybeSingle();
        if (e1 || !codigo) throw new Error("Ese código no existe");

        const { data: usado, error: e2 } = await _supabase.from('codigos_usados')
            .select('*').eq('usuario_id', currentUser.id).eq('codigo_id', codigo.id).maybeSingle();
        if (usado) throw new Error("Ya usaste este código");

        const { error: e3 } = await _supabase.from('codigos_usados').insert([{ usuario_id: currentUser.id, codigo_id: codigo.id }]);
        if (e3) throw e3;

        await sumarXP(codigo.xp_reward, `¡Canjeado! +${codigo.xp_reward} XP`);
        cerrarModales();
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