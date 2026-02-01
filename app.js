// --- CONFIGURACIÓN Y ESTADO ---
const CONFIG = {
    // ✅ CREDENCIALES ACTUALIZADAS Y CORREGIDAS
    URL: 'https://htatptgpjzkjztdqlrzm.supabase.co', 
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0YXRwdGdwanpranp0ZHFscnptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2Mzc4OTIsImV4cCI6MjA4NTIxMzg5Mn0.Zw2XTBUo1xZNooFhdP3vKgL4IokGor8Xx5ogUxaB5tM' 
};

// Validación de seguridad inicial
if (!CONFIG.ANON_KEY || CONFIG.ANON_KEY.length < 20) {
    console.error("⚠️ FALTA CONFIGURAR LA API KEY");
    alert("Error crítico: Credenciales de base de datos inválidas.");
}

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
    toast.innerHTML = `<span>${text}</span> ${isError ? '⚠️' : '✅'}`;
    
    if (isError) {
        toast.style.borderLeftColor = 'var(--error)';
        toast.animate([
            { transform: 'translateX(0)' },
            { transform: 'translateX(-5px)' },
            { transform: 'translateX(5px)' },
            { transform: 'translateX(0)' }
        ], { duration: 200 });
    }
    
    container.appendChild(toast);
    
    setTimeout(() => { 
        toast.style.opacity = '0'; 
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300); 
    }, 4000);
}

function toggleLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.dataset.originalText = btn.innerText;
        btn.innerHTML = `<span style="display:inline-block; animation:pulse 1s infinite">⏳ Procesando...</span>`;
        btn.disabled = true;
    } else {
        btn.innerText = btn.dataset.originalText || "Enviar";
        btn.disabled = false;
    }
}

function cerrarModales() {
    document.querySelectorAll('.modal').forEach(m => {
        m.style.opacity = '0'; 
        m.style.transform = 'scale(1.05)'; // Efecto de salida suave
        setTimeout(() => {
            m.style.display = 'none';
            m.style.transform = ''; // Reset
        }, 200);
    });
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function validarUsername(username) {
    // Solo letras, números y guiones bajos, sin espacios.
    const regex = /^[a-zA-Z0-9_]+$/;
    return regex.test(username);
}

// --- SISTEMA DE NIVELES ---
function obtenerProgreso(totalXP) {
    let tempXP = Number(totalXP) || 0;
    if (tempXP < 0) tempXP = 0;

    let nivel = 1;
    // Lógica segura para evitar loops infinitos
    while (tempXP >= (nivel * 100)) {
        tempXP -= (nivel * 100);
        nivel++;
        if(nivel > 2000) break; // Break de seguridad
    }
    
    const xpNecesaria = nivel * 100;
    let porcentaje = (tempXP / xpNecesaria) * 100;
    if (porcentaje > 100) porcentaje = 100;

    return { nivel, xpRestante: tempXP, xpNecesaria, porcentaje };
}

function actualizarUINiveles(xp) {
    const p = obtenerProgreso(xp);
    const elements = {
        level: document.getElementById('lbl-level'),
        xp: document.getElementById('lbl-xp'),
        bar: document.getElementById('bar-xp')
    };
    if(elements.level) elements.level.innerText = `Nivel ${p.nivel}`;
    if(elements.xp) elements.xp.innerText = `${Math.floor(p.xpRestante).toLocaleString()} / ${p.xpNecesaria.toLocaleString()} XP`;
    if(elements.bar) elements.bar.style.width = `${p.porcentaje}%`;
}

// --- CORE FUNCTIONS ---
async function refrescarDatosUsuario() {
    if (!currentUser) return;
    try {
        const { data, error } = await _supabase.from('usuarios').select('*').eq('id', currentUser.id).maybeSingle();
        
        if (error) throw error;
        
        if (!data) {
            console.warn("Usuario no encontrado en DB, cerrando sesión.");
            logout();
            return;
        }

        // NO guardar password en localstorage por seguridad
        delete data.password; 
        currentUser = data;
        localStorage.setItem('supabase_user', JSON.stringify(data));
        renderDashboard(data);
        
    } catch (e) { 
        console.error("Error refresh:", e);
    }
}

async function sumarXP(cantidad, mensajeExito) {
    if (!currentUser) return;
    // Optimistic UI: Sumamos visualmente antes
    const nuevaXP = (currentUser.xp || 0) + cantidad;
    actualizarUINiveles(nuevaXP);
    
    try {
        // Usamos una llamada RPC si fuera posible, pero aquí usamos update directo
        const { error } = await _supabase.from('usuarios').update({ xp: nuevaXP }).eq('id', currentUser.id);
        if (!error) {
            currentUser.xp = nuevaXP; // Confirmar local
            notify(mensajeExito);
        } else throw error;
    } catch (e) { 
        notify("Error de conexión al guardar XP", true);
        actualizarUINiveles(currentUser.xp); // Revertir visualmente
    }
}

// --- INVENTARIO Y COSMÉTICOS ---
async function equiparColor(colorHex) {
    const prevColor = currentUser.color_name;
    // Feedback visual inmediato
    document.getElementById('side-name').style.color = colorHex;
    
    // Actualizar clase activa en el modal
    document.querySelectorAll('.color-dot').forEach(dot => {
        dot.classList.remove('active');
        if(dot.style.backgroundColor === colorHex) dot.classList.add('active'); // Nota: rgb vs hex puede fallar, mejor usar dataset
    });

    try {
        const { error } = await _supabase.from('usuarios').update({ color_name: colorHex }).eq('id', currentUser.id);
        if (error) throw error;
        notify("¡Color equipado con éxito!");
        currentUser.color_name = colorHex;
        refrescarDatosUsuario();
    } catch (e) { 
        document.getElementById('side-name').style.color = prevColor;
        notify("Error al equipar: " + e.message, true); 
        cargarInventarioColores(); // Recargar para revertir selección
    }
}

async function cargarInventarioColores() {
    const container = document.getElementById('colores-poseidos');
    container.innerHTML = "<div class='inventory-empty' style='color:white'>Cargando...</div>";

    const { data, error } = await _supabase
        .from('inventario_colores')
        .select('color_hex')
        .eq('usuario_id', currentUser.id);

    if (error) {
        container.innerHTML = "<div class='inventory-empty' style='color:red'>Error de carga</div>";
        return;
    }

    container.innerHTML = "";
    // Color por defecto (Blanco)
    const defaultColor = { color_hex: '#ffffff' };
    // Evitar duplicados si el usuario compró blanco (poco probable pero posible)
    const dataLimpia = data || [];
    const todosLosColores = [defaultColor, ...dataLimpia];

    todosLosColores.forEach(item => {
        const dot = document.createElement('div');
        dot.className = "color-dot";
        // Comparación simple (idealmente convertir ambos a lowercase)
        if ((currentUser.color_name || '#ffffff').toLowerCase() === item.color_hex.toLowerCase()) {
            dot.classList.add('active');
        }
        dot.style.backgroundColor = item.color_hex;
        dot.title = "Click para equipar";
        dot.onclick = () => equiparColor(item.color_hex);
        container.appendChild(dot);
    });
    
    if (todosLosColores.length === 1) {
         container.innerHTML += "<p style='width:100%; text-align:center; font-size:0.8rem; color:#94a3b8; margin-top:10px'>Canjea códigos para conseguir más colores.</p>";
    }
}

// --- MISIONES (Lógica Corregida y Optimizada) ---
function actualizarContadores() {
    if (!currentUser) return;
    const ahora = new Date().getTime();
    
    const missions = [
        { idCard: 'card-12h', idBtn: 'btn-claim-12h', idTxt: 'timer-12h', hours: 12, last: currentUser.ultimo_12h },
        { idCard: 'card-24h', idBtn: 'btn-claim-24h', idTxt: 'timer-24h', hours: 24, last: currentUser.ultimo_checkin }
    ];

    missions.forEach(m => {
        const lastTime = m.last ? new Date(m.last).getTime() : 0;
        const availableTime = lastTime + (m.hours * 60 * 60 * 1000);
        const diff = availableTime - ahora;

        const btn = document.getElementById(m.idBtn);
        const txt = document.getElementById(m.idTxt);
        const card = document.getElementById(m.idCard);

        if (btn && txt) {
            if (diff > 0) {
                // En enfriamiento
                btn.disabled = true;
                btn.innerText = "Esperando...";
                txt.innerText = formatTime(diff);
                txt.classList.remove('mission-ready-text');
                if(card) card.classList.remove('mission-ready');
            } else {
                // Listo
                if (btn.innerText !== "Reclamar") { // Evitar repintado innecesario
                    btn.disabled = false;
                    btn.innerText = "Reclamar";
                    txt.innerText = "¡DISPONIBLE!";
                    txt.classList.add('mission-ready-text');
                    if(card) card.classList.add('mission-ready');
                }
            }
        }
    });
}

function formatTime(ms) {
    const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
    const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

async function reclamarMision(tipo) {
    const btnId = tipo === 12 ? 'btn-claim-12h' : 'btn-claim-24h';
    const btn = document.getElementById(btnId);
    if(btn && btn.disabled) return;

    const xp = tipo === 12 ? 10 : 15;
    const column = tipo === 12 ? 'ultimo_12h' : 'ultimo_checkin';
    // Usar ISO string para asegurar compatibilidad con timestampz de Postgres
    const ahora = new Date().toISOString();

    toggleLoading(btnId, true);
    try {
        // Doble verificación: comprobar timestamp en DB para evitar "doble click" rápido
        const { data: checkData } = await _supabase.from('usuarios').select(column).eq('id', currentUser.id).single();
        if(checkData) {
            const lastTime = checkData[column] ? new Date(checkData[column]).getTime() : 0;
            const hoursNeeded = tipo;
            const diff = (new Date().getTime()) - lastTime;
            // Permitir un margen de error de 1 min por diferencias de reloj
            if (diff < (hoursNeeded * 3600000 - 60000)) {
                throw new Error("Aún no ha pasado el tiempo suficiente.");
            }
        }

        const { error } = await _supabase.from('usuarios').update({ [column]: ahora }).eq('id', currentUser.id);
        if (!error) {
            await sumarXP(xp, `¡Misión completada! +${xp} XP`);
            currentUser[column] = ahora; 
            actualizarContadores();
        } else throw error;
    } catch (e) { notify(e.message, true); }
    finally { toggleLoading(btnId, false); actualizarContadores(); }
}

// --- CLASIFICACIÓN ---
async function cargarLeaderboard() {
    const listContainer = document.getElementById('leaderboard-list');
    listContainer.innerHTML = "<p style='text-align:center; font-size:0.8rem; color:var(--text-muted); padding:20px;'>Cargando tops...</p>";
    
    try {
        const { data, error } = await _supabase
            .from('usuarios')
            .select('usuario, xp')
            .gt('xp', 0)
            .order('xp', { ascending: false })
            .limit(50);

        if (error) throw error;

        listContainer.innerHTML = data.length === 0 ? "<p style='text-align:center; font-size:0.8rem; padding:20px;'>Nadie ha conseguido XP aún.</p>" : "";
        data.forEach((user, index) => {
            const info = obtenerProgreso(user.xp);
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            
            let rankDisplay = `<span style="color:var(--text-muted)">#${index + 1}</span>`;
            if (index === 0) rankDisplay = '🥇';
            if (index === 1) rankDisplay = '🥈';
            if (index === 2) rankDisplay = '🥉';

            // Resaltar al usuario actual
            if(user.usuario === currentUser.usuario) {
                item.style.background = 'rgba(62, 207, 142, 0.1)';
                item.style.border = '1px solid var(--primary)';
            }

            item.innerHTML = `
                <span class="rank-number">${rankDisplay}</span>
                <span class="rank-name">${user.usuario}</span>
                <span class="rank-xp">Nivel ${info.nivel}</span>`;
            listContainer.appendChild(item);
        });
    } catch (e) { listContainer.innerHTML = "<p style='color:var(--error); text-align:center;'>Error al cargar ranking</p>"; }
}

// --- DASHBOARD & AUTH ---
function renderDashboard(user) {
    if (!user) return;
    currentUser = user;
    
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('welcome-view').classList.remove('hidden');
    document.getElementById('sidebar').style.display = 'flex';
    
    const sideName = document.getElementById('side-name');
    const avatar = document.getElementById('avatar-circle');
    
    sideName.innerText = user.usuario;
    sideName.style.color = user.color_name || '#ffffff';
    avatar.innerText = user.usuario.charAt(0).toUpperCase();

    document.getElementById('side-rank').innerText = user.rango;
    actualizarUINiveles(user.xp);

    const isOwner = user.rango === 'OWNER';
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel) {
        isOwner ? adminPanel.classList.remove('hidden') : adminPanel.classList.add('hidden');
    }

    document.getElementById('side-rank').classList.toggle('owner-style', isOwner);
    avatar.classList.toggle('owner-style', isOwner);
    avatar.style.borderColor = isOwner ? 'var(--owner-color)' : 'var(--primary)';
}

function logout() {
    localStorage.removeItem('supabase_user');
    location.reload();
}

document.getElementById('toggle-auth').onclick = () => {
    isLoginMode = !isLoginMode;
    document.getElementById('form-title').innerText = isLoginMode ? "Moon Play" : "Crear Cuenta";
    document.getElementById('btn-main').innerText = isLoginMode ? "Acceder al Panel" : "Registrarse ahora";
};

document.getElementById('btn-main').onclick = async () => {
    const uInput = document.getElementById('username');
    const pInput = document.getElementById('password');
    const u = uInput.value.trim();
    const p = pInput.value.trim();
    
    if (!u || !p) return notify("Completa todos los campos", true);
    if (!validarUsername(u)) return notify("El usuario solo puede tener letras y números", true);
    if (u.length < 3) return notify("El usuario es muy corto (min 3)", true);
    
    toggleLoading('btn-main', true);
    try {
        if (isLoginMode) {
            // LOGIN
            const { data, error } = await _supabase.from('usuarios').select('*').eq('usuario', u).eq('password', p).maybeSingle();
            if (error) throw error;
            if (data) {
                notify("¡Hola de nuevo! 👋");
                renderDashboard(data);
                // Guardar sesión (sin password)
                delete data.password;
                localStorage.setItem('supabase_user', JSON.stringify(data));
                uInput.value = "";
                pInput.value = "";
            } else {
                notify("Usuario o contraseña incorrectos", true);
            }
        } else {
            // REGISTRO - Check duplicados
            const { data: exist } = await _supabase.from('usuarios').select('id').eq('usuario', u).maybeSingle();
            if (exist) {
                notify("¡Ese nombre de usuario ya existe!", true);
            } else {
                const { error } = await _supabase.from('usuarios').insert([{ usuario: u, password: p, rango: 'USUARIO', xp: 0 }]);
                if (error) throw error;
                notify("¡Cuenta creada! Inicia sesión ahora.");
                document.getElementById('toggle-auth').click(); // Cambiar a modo login
            }
        }
    } catch (err) { notify("Error: " + err.message, true); } 
    finally { toggleLoading('btn-main', false); }
};

// --- MODAL EVENTS ---
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'flex';
    modal.style.opacity = '1';
}

document.getElementById('btn-open-settings').onclick = () => {
    document.getElementById('new-username').value = currentUser.usuario;
    document.getElementById('new-password').value = ""; // Limpiar siempre password field
    openModal('settings-modal');
};
document.getElementById('btn-open-codes').onclick = () => {
    document.getElementById('input-code').value = "";
    openModal('codes-modal');
};
document.getElementById('btn-open-leaderboard').onclick = () => {
    openModal('leaderboard-modal');
    cargarLeaderboard();
};
document.getElementById('btn-open-missions').onclick = () => {
    if (timerInterval) clearInterval(timerInterval);
    openModal('missions-modal');
    actualizarContadores();
    timerInterval = setInterval(actualizarContadores, 1000);
};
document.getElementById('btn-open-inventory').onclick = () => {
    openModal('inventory-modal');
    cargarInventarioColores();
};

['settings', 'codes', 'leaderboard', 'missions', 'inventory'].forEach(id => {
    const btn = document.getElementById(`btn-close-${id}`);
    if(btn) btn.onclick = cerrarModales;
});

window.onclick = (event) => {
    if (event.target.classList.contains('modal')) cerrarModales();
};

document.getElementById('btn-claim-12h').onclick = () => reclamarMision(12);
document.getElementById('btn-claim-24h').onclick = () => reclamarMision(24);


// --- ACTUALIZAR PERFIL (ARREGLADO: VALIDACIÓN DE DUPLICADOS) ---
document.getElementById('btn-update').onclick = async () => {
    const nuevoU = document.getElementById('new-username').value.trim();
    const nuevaP = document.getElementById('new-password').value.trim();
    
    if (!nuevoU) return notify("El nombre no puede estar vacío", true);
    if (!validarUsername(nuevoU)) return notify("Nombre inválido (solo letras/números)", true);
    
    toggleLoading('btn-update', true);
    try {
        // 1. Verificar si el nombre ya está en uso por OTRA persona
        if (nuevoU !== currentUser.usuario) {
            const { data: existingUser, error: checkError } = await _supabase
                .from('usuarios')
                .select('id')
                .eq('usuario', nuevoU)
                .neq('id', currentUser.id) // Excluirse a sí mismo
                .maybeSingle();
            
            if (checkError) throw checkError;
            if (existingUser) throw new Error("Ese nombre de usuario ya está ocupado 🚫");
        }

        // 2. Preparar actualización
        const updateData = { usuario: nuevoU };
        if (nuevaP) {
            if (nuevaP.length < 4) throw new Error("La contraseña es muy corta");
            updateData.password = nuevaP;
        }
        
        // 3. Ejecutar
        const { error } = await _supabase.from('usuarios').update(updateData).eq('id', currentUser.id);
        if (error) throw error;
        
        notify("Perfil actualizado con éxito ✨");
        
        // Update local
        currentUser.usuario = nuevoU;
        // Refrescar toda la UI
        renderDashboard(currentUser); 
        setTimeout(cerrarModales, 500);
        
    } catch (e) { notify(e.message, true); } 
    finally { toggleLoading('btn-update', false); }
};

document.getElementById('btn-redeem-code').onclick = async () => {
    const input = document.getElementById('input-code').value.trim().toUpperCase();
    if (!input) return notify("Escribe un código", true);
    
    toggleLoading('btn-redeem-code', true);
    try {
        const { data: codigo, error: errCod } = await _supabase.from('codigos').select('*').eq('codigo', input).maybeSingle();
        if (errCod) throw errCod;
        if (!codigo) throw new Error("Código no válido o expirado");

        const { data: usado } = await _supabase.from('codigos_usados').select('*').eq('usuario_id', currentUser.id).eq('codigo_id', codigo.id).maybeSingle();
        if (usado) throw new Error("Ya has canjeado este código 🎁");

        // Registrar uso
        await _supabase.from('codigos_usados').insert([{ usuario_id: currentUser.id, codigo_id: codigo.id }]);

        let msg = "";
        // Dar color si hay
        if (codigo.recompensa_especial) {
            // Verificar si ya lo tiene para no llenar la DB de errores
            const {data: tieneColor} = await _supabase.from('inventario_colores')
                .select('*').eq('usuario_id', currentUser.id).eq('color_hex', codigo.recompensa_especial).maybeSingle();
            
            if(!tieneColor){
                await _supabase.from('inventario_colores').insert([{ usuario_id: currentUser.id, color_hex: codigo.recompensa_especial }]);
                msg = " + Nuevo Color 🎨";
            }
        }

        await sumarXP(codigo.xp_reward, `¡Código canjeado! +${codigo.xp_reward} XP${msg}`);
        
        document.getElementById('input-code').value = ""; 
        setTimeout(cerrarModales, 1500);
        
    } catch (err) { notify(err.message, true); } 
    finally { toggleLoading('btn-redeem-code', false); }
};

document.getElementById('btn-logout-side').onclick = () => {
    if(confirm("¿Seguro que quieres cerrar sesión?")) logout();
};

// --- INITIALIZATION ---
(async () => {
    const saved = localStorage.getItem('supabase_user');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Renderizado inicial rápido
            renderDashboard(parsed);
            // Verificación asíncrona real
            refrescarDatosUsuario();
        } catch (e) {
            console.error("Sesión inválida");
            logout();
        }
    }
})();

// Consola Master
const btnFetch = document.getElementById('btn-fetch');
if(btnFetch) {
    btnFetch.onclick = async () => {
        const out = document.getElementById('output');
        out.innerText = "Consultando DB...";
        const { data, error } = await _supabase.from('usuarios').select('usuario, rango, xp').order('xp', { ascending: false });
        if(error) out.innerText = "Error: " + error.message;
        else out.innerText = JSON.stringify(data, null, 2);
    };
}