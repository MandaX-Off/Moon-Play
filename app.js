// --- CONFIGURACIÓN Y ESTADO ---
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
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
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
    const { error } = await _supabase.from('usuarios').update({ xp: nuevaXP }).eq('id', currentUser.id);
    if (!error) {
        await refrescarDatosUsuario();
        notify(mensajeExito);
    } else {
        notify("Error al actualizar XP: " + error.message, true);
    }
}

// --- SISTEMA DE INVENTARIO Y COLORES ---

async function equiparColor(colorHex) {
    const { error } = await _supabase
        .from('usuarios')
        .update({ color_name: colorHex })
        .eq('id', currentUser.id);

    if (!error) {
        notify("¡Color equipado con éxito!");
        refrescarDatosUsuario();
    } else {
        notify("Error al equipar: " + error.message, true);
    }
}

async function cargarInventarioColores() {
    const container = document.getElementById('colores-poseidos');
    container.innerHTML = "<div class='inventory-empty'>Cargando...</div>";

    const { data, error } = await _supabase
        .from('inventario_colores')
        .select('color_hex')
        .eq('usuario_id', currentUser.id);

    if (error || !data || data.length === 0) {
        container.innerHTML = "<div class='inventory-empty'>No tienes colores desbloqueados.</div>";
        return;
    }

    container.innerHTML = "";
    data.forEach(item => {
        const dot = document.createElement('div');
        dot.className = "color-dot";
        dot.style.backgroundColor = item.color_hex;
        dot.title = "Click para equipar";
        dot.onclick = () => equiparColor(item.color_hex);
        container.appendChild(dot);
    });
}

// --- MISIONES Y CONTADORES ---
function actualizarContadores() {
    if (!currentUser) return;
    const ahora = new Date().getTime();
    const missions = [
        { idBtn: 'btn-claim-12h', idTxt: 'timer-12h', hours: 12, last: currentUser.ultimo_12h },
        { idBtn: 'btn-claim-24h', idTxt: 'timer-24h', hours: 24, last: currentUser.ultimo_checkin }
    ];

    missions.forEach(m => {
        const lastTime = m.last ? new Date(m.last).getTime() : 0;
        const diff = (m.hours * 60 * 60 * 1000) - (ahora - lastTime);
        const btn = document.getElementById(m.idBtn);
        const txt = document.getElementById(m.idTxt);
        if (btn && txt) {
            if (diff > 0) {
                btn.disabled = true;
                txt.innerText = formatTime(diff);
            } else {
                btn.disabled = false;
                txt.innerText = "LISTO";
            }
        }
    });
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
    const { error } = await _supabase.from('usuarios').update({ [column]: ahora }).eq('id', currentUser.id);

    if (!error) {
        await sumarXP(xp, `¡Misión completada! +${xp} XP`);
        actualizarContadores();
    } else {
        notify("Error: " + error.message, true);
    }
    toggleLoading(btnId, false);
}

// --- CLASIFICACIÓN ---
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

    listContainer.innerHTML = data.length === 0 ? "<p style='text-align:center; font-size:0.8rem;'>Aún no hay nadie con XP.</p>" : "";
    data.forEach((user, index) => {
        const info = obtenerProgreso(user.xp);
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.innerHTML = `<span class="rank-number">#${index + 1}</span><span class="rank-name">${user.usuario}</span><span class="rank-xp">Nivel ${info.nivel} (${user.xp} XP)</span>`;
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
    
    // Aplicar color de nombre guardado
    const sideName = document.getElementById('side-name');
    sideName.innerText = user.usuario;
    sideName.style.color = user.color_name || '#ffffff';

    document.getElementById('side-rank').innerText = user.rango;
    actualizarUINiveles(user.xp);

    const isOwner = user.rango === 'OWNER';
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel) {
        if (!isOwner) {
            adminPanel.remove(); 
        } else {
            adminPanel.classList.remove('hidden');
        }
    }

    document.getElementById('side-rank').classList.toggle('owner-style', isOwner);
    document.getElementById('avatar-circle').classList.toggle('owner-style', isOwner);
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
            const { data, error } = await _supabase.from('usuarios').select('*').eq('usuario', u).eq('password', p).maybeSingle();
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
                const { error } = await _supabase.from('usuarios').insert([{ usuario: u, password: p, rango: 'USUARIO', xp: 0 }]);
                if (error) throw error;
                notify("¡Cuenta creada! Ya puedes entrar.");
                document.getElementById('toggle-auth').click();
            }
        }
    } catch (err) { notify(err.message, true); } finally { toggleLoading('btn-main', false); }
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
    if (timerInterval) clearInterval(timerInterval);
    document.getElementById('missions-modal').style.display = 'flex';
    actualizarContadores();
    timerInterval = setInterval(actualizarContadores, 1000);
};
document.getElementById('btn-open-inventory').onclick = () => {
    document.getElementById('inventory-modal').style.display = 'flex';
    cargarInventarioColores();
};

document.getElementById('btn-close-settings').onclick = cerrarModales;
document.getElementById('btn-close-codes').onclick = cerrarModales;
document.getElementById('btn-close-leaderboard').onclick = cerrarModales;
document.getElementById('btn-close-missions').onclick = cerrarModales;
document.getElementById('btn-close-inventory').onclick = cerrarModales;

document.getElementById('btn-claim-12h').onclick = () => reclamarMision(12);
document.getElementById('btn-claim-24h').onclick = () => reclamarMision(24);

// --- ACTUALIZACIÓN DE PERFIL ---
document.getElementById('btn-update').onclick = async () => {
    const nuevoU = document.getElementById('new-username').value.trim();
    const nuevaP = document.getElementById('new-password').value.trim();
    if (!nuevoU) return notify("El nombre no puede estar vacío", true);
    
    toggleLoading('btn-update', true);
    try {
        if (nuevoU !== currentUser.usuario) {
            const { data: exist } = await _supabase.from('usuarios').select('id').eq('usuario', nuevoU).neq('id', currentUser.id).maybeSingle();
            if (exist) throw new Error("Ese nombre ya está en uso");
        }
        const updateData = { usuario: nuevoU };
        if (nuevaP) updateData.password = nuevaP;
        const { error } = await _supabase.from('usuarios').update(updateData).eq('id', currentUser.id);
        if (error) throw error;
        notify("Perfil actualizado ✨");
        await refrescarDatosUsuario();
        setTimeout(cerrarModales, 500);
    } catch (e) { notify(e.message, true); } finally { toggleLoading('btn-update', false); }
};

// --- REDEEM CODES (CON RECOMPENSA ESPECIAL) ---
document.getElementById('btn-redeem-code').onclick = async () => {
    const input = document.getElementById('input-code').value.trim().toUpperCase();
    if (!input) return notify("Introduce un código", true);
    
    toggleLoading('btn-redeem-code', true);
    
    try {
        const { data: codigo, error: e1 } = await _supabase.from('codigos').select('*').eq('codigo', input).maybeSingle();
        if (e1 || !codigo) throw new Error("Ese código no existe");

        const { data: usado } = await _supabase.from('codigos_usados').select('*').eq('usuario_id', currentUser.id).eq('codigo_id', codigo.id).maybeSingle();
        if (usado) throw new Error("Ya usaste este código");

        const { error: e3 } = await _supabase.from('codigos_usados').insert([{ usuario_id: currentUser.id, codigo_id: codigo.id }]);
        if (e3) throw e3;

        // Lógica de Recompensa Especial (Si el código tiene un color)
        if (codigo.recompensa_especial) {
            const colorHex = codigo.recompensa_especial;
            // Guardar en la tabla de inventario_colores
            const { error: eColor } = await _supabase
                .from('inventario_colores')
                .insert([{ usuario_id: currentUser.id, color_hex: colorHex }]);
            
            if (!eColor) {
                notify("¡RECOMPENSA ESPECIAL! Color de nombre añadido al inventario 🎒");
            }
        }

        await sumarXP(codigo.xp_reward, `¡Canjeado! +${codigo.xp_reward} XP`);
        cerrarModales();
    } catch (err) { notify(err.message, true); } finally { toggleLoading('btn-redeem-code', false); }
};

document.getElementById('btn-logout-side').onclick = () => {
    localStorage.removeItem('supabase_user');
    location.reload();
};

const btnFetch = document.getElementById('btn-fetch');
if(btnFetch) {
    btnFetch.onclick = async () => {
        const out = document.getElementById('output');
        if(!out) return;
        out.innerText = "Consultando...";
        const { data } = await _supabase.from('usuarios').select('id, usuario, rango, xp').order('xp', { ascending: false });
        out.innerText = JSON.stringify(data, null, 2);
    };
}