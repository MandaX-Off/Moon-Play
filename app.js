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

// 🔒 DETECCIÓN ROBUSTA DE BCRYPTJS
let hasher = null;
let bcryptLoadAttempts = 0;
const MAX_BCRYPT_ATTEMPTS = 10;

async function waitForBcrypt() {
    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
            if (window.dcodeIO && window.dcodeIO.bcrypt) {
                hasher = window.dcodeIO.bcrypt;
                clearInterval(checkInterval);
                console.log("✅ bcryptjs cargado correctamente");
                resolve(true);
            } else if (window.bcrypt) {
                hasher = window.bcrypt;
                clearInterval(checkInterval);
                console.log("✅ bcryptjs cargado correctamente");
                resolve(true);
            } else {
                bcryptLoadAttempts++;
                if (bcryptLoadAttempts >= MAX_BCRYPT_ATTEMPTS) {
                    clearInterval(checkInterval);
                    console.error("❌ No se pudo cargar bcryptjs después de múltiples intentos");
                    reject(new Error("No se pudo cargar la librería de encriptación"));
                }
            }
        }, 100);
    });
}

// Inicializar bcryptjs al cargar
(async function initBcrypt() {
    try {
        await waitForBcrypt();
    } catch (error) {
        console.error("Error crítico:", error);
        alert("Error al cargar el sistema de seguridad. Por favor, recarga la página.");
    }
})();

let currentUser = null;
let u = null; // Variable global para compatibilidad con UI
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
        m.style.transform = 'scale(1.05)';
        setTimeout(() => {
            m.style.display = 'none';
            m.style.transform = '';
        }, 200);
    });
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function validarUsername(username) {
    const regex = /^[a-zA-Z0-9_]+$/;
    return regex.test(username);
}

// --- SISTEMA DE NIVELES ---
function obtenerProgreso(totalXP) {
    let tempXP = Number(totalXP) || 0;
    if (tempXP < 0) tempXP = 0;

    let nivel = 1;
    while (tempXP >= (nivel * 100)) {
        tempXP -= (nivel * 100);
        nivel++;
        if(nivel > 2000) break;
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
    if (!currentUser || !currentUser.id) {
        console.warn("No hay usuario actual para refrescar");
        return;
    }
    
    try {
        const { data, error } = await _supabase.from('usuarios').select('*').eq('id', currentUser.id).maybeSingle();
        
        if (error) {
            console.error("Error al refrescar datos:", error);
            return;
        }
        
        if (!data) {
            console.warn("Usuario no encontrado en DB, cerrando sesión.");
            logout();
            return;
        }

        // 🔒 SEGURIDAD: Eliminar password de memoria
        delete data.password; 
        currentUser = data;
        u = data; // Sincronizar variable global
        localStorage.setItem('supabase_user', JSON.stringify(data));
        
        actualizarUINiveles(data.xp);
        
        const sideName = document.getElementById('side-name');
        if (sideName) {
            sideName.innerText = data.usuario;
            sideName.style.color = data.color_name || '#ffffff';
        }
        
    } catch (e) { 
        console.error("Error refresh:", e);
    }
}

async function sumarXP(cantidad, mensajeExito) {
    if (!currentUser) return;
    const nuevaXP = (currentUser.xp || 0) + cantidad;
    actualizarUINiveles(nuevaXP);
    
    try {
        const { error } = await _supabase.from('usuarios').update({ xp: nuevaXP }).eq('id', currentUser.id);
        if (!error) {
            currentUser.xp = nuevaXP;
            u.xp = nuevaXP; // Sincronizar variable global
            notify(mensajeExito);
        } else throw error;
    } catch (e) { 
        notify("Error de conexión al guardar XP", true);
        actualizarUINiveles(currentUser.xp);
    }
}

// --- INVENTARIO Y COSMÉTICOS ---
async function equiparColor(colorHex) {
    const prevColor = currentUser.color_name;
    document.getElementById('side-name').style.color = colorHex;
    
    document.querySelectorAll('.color-dot').forEach(dot => {
        dot.classList.remove('active');
        if(dot.style.backgroundColor === colorHex) dot.classList.add('active');
    });

    try {
        const { error } = await _supabase.from('usuarios').update({ color_name: colorHex }).eq('id', currentUser.id);
        if (error) throw error;
        notify("¡Color equipado con éxito!");
        currentUser.color_name = colorHex;
        u.color_name = colorHex; // Sincronizar variable global
        refrescarDatosUsuario();
    } catch (e) { 
        document.getElementById('side-name').style.color = prevColor;
        notify("Error al equipar: " + e.message, true); 
        cargarInventarioColores();
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
    const defaultColor = { color_hex: '#ffffff' };
    const dataLimpia = data || [];
    const todosLosColores = [defaultColor, ...dataLimpia];

    todosLosColores.forEach(item => {
        const dot = document.createElement('div');
        dot.className = "color-dot";
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
                btn.disabled = true;
                btn.innerText = "Esperando...";
                txt.innerText = formatTime(diff);
                txt.classList.remove('mission-ready-text');
                if(card) card.classList.remove('mission-ready');
            } else {
                if (btn.innerText !== "Reclamar") {
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
    const ahora = new Date().toISOString();

    toggleLoading(btnId, true);
    try {
        const { data: checkData } = await _supabase.from('usuarios').select(column).eq('id', currentUser.id).single();
        if(checkData) {
            const lastTime = checkData[column] ? new Date(checkData[column]).getTime() : 0;
            const hoursNeeded = tipo;
            const diff = (new Date().getTime()) - lastTime;
            if (diff < (hoursNeeded * 3600000 - 60000)) {
                throw new Error("Aún no ha pasado el tiempo suficiente.");
            }
        }

        const { error } = await _supabase.from('usuarios').update({ [column]: ahora }).eq('id', currentUser.id);
        if (!error) {
            await sumarXP(xp, `¡Misión completada! +${xp} XP`);
            currentUser[column] = ahora; 
            u[column] = ahora; // Sincronizar variable global
            actualizarContadores();
        } else throw error;
    } catch (e) { notify(e.message, true); }
    finally { toggleLoading(btnId, false); actualizarContadores(); }
}

function showMissions() {
    if (timerInterval) clearInterval(timerInterval);
    openModal('missions-modal');
    actualizarContadores();
    timerInterval = setInterval(actualizarContadores, 1000);
}

// --- CLASIFICACIÓN ---
async function cargarLeaderboard() {
    const listContainer = document.getElementById('leaderboard-list');
    listContainer.innerHTML = "<p style='text-align:center; font-size:0.8rem; color:var(--text-muted); padding:20px;'>Cargando tops...</p>";
    
    try {
        const { data, error } = await _supabase
            .from('usuarios')
            .select('usuario, xp, color_name')
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

            if(user.usuario === currentUser.usuario) {
                item.style.background = 'rgba(62, 207, 142, 0.1)';
                item.style.border = '1px solid var(--primary)';
            }

            const userColor = user.color_name || '#ffffff';

            item.innerHTML = `
                <span class="rank-number">${rankDisplay}</span>
                <span class="rank-name" style="color: ${userColor};">${user.usuario}</span>
                <span class="rank-xp">Nivel ${info.nivel} (${user.xp.toLocaleString()} XP)</span>`;
            listContainer.appendChild(item);
        });
        
        // Actualizar estadística en dashboard
        const userRank = data.findIndex(user => user.usuario === currentUser.usuario) + 1;
        const statRank = document.getElementById('stat-rank');
        if (statRank) {
            statRank.innerText = userRank > 0 ? `#${userRank}` : 'N/A';
        }
    } catch (e) { listContainer.innerHTML = "<p style='color:var(--error); text-align:center;'>Error al cargar ranking</p>"; }
}

// --- DASHBOARD & AUTH ---
function renderDashboard(user) {
    if (!user) return;
    
    // 🔒 SEGURIDAD: Eliminar password de objetos globales
    delete user.password;
    currentUser = user;
    u = user; // Sincronizar variable global
    
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('dashboard-container').classList.add('dashboard-active');
    document.getElementById('sidebar').style.display = 'flex';
    
    const sideName = document.getElementById('side-name');
    const avatar = document.getElementById('avatar-icon');
    
    sideName.innerText = user.usuario;
    sideName.style.color = user.color_name || '#ffffff';
    avatar.innerText = user.usuario.charAt(0).toUpperCase();

    document.getElementById('side-rank').innerText = user.rango;
    actualizarUINiveles(user.xp);

    const isOwner = user.rango === 'OWNER';
    document.getElementById('side-rank').style.color = isOwner ? 'var(--owner-color)' : 'var(--primary)';
    
    // Actualizar estadísticas del dashboard
    const statColors = document.getElementById('stat-colors');
    if (statColors) {
        _supabase.from('inventario_colores').select('id', { count: 'exact' }).eq('usuario_id', user.id).then(({ count }) => {
            statColors.innerText = (count || 0) + 1; // +1 por el color blanco por defecto
        });
    }
    
    const statMissions = document.getElementById('stat-missions');
    if (statMissions) {
        const ahora = new Date().getTime();
        let activas = 0;
        if (!user.ultimo_12h || (ahora - new Date(user.ultimo_12h).getTime()) >= 12 * 60 * 60 * 1000) activas++;
        if (!user.ultimo_checkin || (ahora - new Date(user.ultimo_checkin).getTime()) >= 24 * 60 * 60 * 1000) activas++;
        statMissions.innerText = activas;
    }
}

function logout() {
    localStorage.removeItem('supabase_user');
    location.reload();
}

// --- AUTH CONTROLS ---
const btnLoginTab = document.getElementById('btn-login-tab');
const btnRegisterTab = document.getElementById('btn-register-tab');
const btnAuth = document.getElementById('btn-auth');

if (btnLoginTab && btnRegisterTab && btnAuth) {
    btnLoginTab.onclick = () => {
        isLoginMode = true;
        btnAuth.innerText = "Iniciar Sesión";
        btnLoginTab.style.background = 'var(--primary)';
        btnLoginTab.style.color = '#0b0f1a';
        btnRegisterTab.style.background = 'transparent';
        btnRegisterTab.style.color = 'var(--text-muted)';
    };
    
    btnRegisterTab.onclick = () => {
        isLoginMode = false;
        btnAuth.innerText = "Registrarse";
        btnRegisterTab.style.background = 'var(--primary)';
        btnRegisterTab.style.color = '#0b0f1a';
        btnLoginTab.style.background = 'transparent';
        btnLoginTab.style.color = 'var(--text-muted)';
    };

    btnAuth.onclick = async () => {
        if (!hasher) {
            notify("Sistema de seguridad no está listo. Intenta de nuevo en unos segundos.", true);
            return;
        }
        
        const uInput = document.getElementById('input-user');
        const pInput = document.getElementById('input-pass');
        const usuario = uInput.value.trim();
        const password = pInput.value.trim();
        
        if (!usuario || !password) return notify("Completa todos los campos", true);
        if (!validarUsername(usuario)) return notify("El usuario solo puede tener letras y números", true);
        if (usuario.length < 3) return notify("El usuario es muy corto (min 3)", true);
        
        toggleLoading('btn-auth', true);
        try {
            if (isLoginMode) {
                // 🔒 LOGIN CON BCRYPT
                const { data: userData, error: selectError } = await _supabase
                    .from('usuarios')
                    .select('*')
                    .eq('usuario', usuario)
                    .maybeSingle();
                
                if (selectError) throw selectError;
                
                if (!userData) {
                    notify("Usuario o contraseña incorrectos", true);
                } else {
                    // Comparar password
                    const passwordValida = await new Promise((resolve) => {
                        try {
                            const resultado = hasher.compareSync(password, userData.password);
                            resolve(resultado);
                        } catch (e) {
                            console.error("Error al comparar password:", e);
                            resolve(false);
                        }
                    });
                    
                    if (passwordValida) {
                        // 🔒 SEGURIDAD: Eliminar password antes de guardar
                        delete userData.password;
                        localStorage.setItem('supabase_user', JSON.stringify(userData));
                        
                        notify("¡Hola de nuevo! 👋");
                        renderDashboard(userData);
                        uInput.value = "";
                        pInput.value = "";
                    } else {
                        notify("Usuario o contraseña incorrectos", true);
                    }
                }
            } else {
                // 🔒 REGISTRO CON BCRYPT
                const { data: exist } = await _supabase
                    .from('usuarios')
                    .select('id')
                    .eq('usuario', usuario)
                    .maybeSingle();
                
                if (exist) {
                    notify("¡Ese nombre de usuario ya existe!", true);
                } else {
                    // Hashear contraseña
                    const passwordHash = await new Promise((resolve, reject) => {
                        try {
                            const hash = hasher.hashSync(password, 10);
                            resolve(hash);
                        } catch (e) {
                            reject(e);
                        }
                    });
                    
                    const { error } = await _supabase
                        .from('usuarios')
                        .insert([{ 
                            usuario: usuario, 
                            password: passwordHash, 
                            rango: 'USUARIO', 
                            xp: 0 
                        }]);
                    
                    if (error) throw error;
                    notify("¡Cuenta creada! Inicia sesión ahora.");
                    btnLoginTab.click();
                }
            }
        } catch (err) { 
            notify("Error: " + err.message, true); 
        } finally { 
            toggleLoading('btn-auth', false); 
        }
    };
}

// --- MODAL EVENTS ---
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'flex';
    modal.style.opacity = '1';
}

// 🔒 CAMBIO DE CONTRASEÑA CON BCRYPT
const btnChangePass = document.getElementById('btn-change-pass');
if (btnChangePass) {
    btnChangePass.onclick = async () => {
        if (!hasher) {
            notify("Sistema de seguridad no está listo. Intenta de nuevo en unos segundos.", true);
            return;
        }
        
        const oldPass = document.getElementById('input-old-pass').value.trim();
        const newPass = document.getElementById('input-new-pass').value.trim();
        const confirmPass = document.getElementById('input-confirm-pass').value.trim();
        
        if (!oldPass || !newPass || !confirmPass) {
            return notify("Completa todos los campos", true);
        }
        
        if (newPass !== confirmPass) {
            return notify("Las contraseñas nuevas no coinciden", true);
        }
        
        if (newPass.length < 4) {
            return notify("La contraseña nueva es muy corta (mín. 4 caracteres)", true);
        }
        
        toggleLoading('btn-change-pass', true);
        
        try {
            // Obtener password actual de la BD
            const { data: userData, error: fetchError } = await _supabase
                .from('usuarios')
                .select('password')
                .eq('id', currentUser.id)
                .single();
            
            if (fetchError) throw fetchError;
            
            // Verificar contraseña actual
            const passwordActualValida = await new Promise((resolve) => {
                try {
                    const resultado = hasher.compareSync(oldPass, userData.password);
                    resolve(resultado);
                } catch (e) {
                    console.error("Error al verificar password actual:", e);
                    resolve(false);
                }
            });
            
            if (!passwordActualValida) {
                throw new Error("La contraseña actual es incorrecta");
            }
            
            // Hashear nueva contraseña
            const nuevoPasswordHash = await new Promise((resolve, reject) => {
                try {
                    const hash = hasher.hashSync(newPass, 10);
                    resolve(hash);
                } catch (e) {
                    reject(e);
                }
            });
            
            // Actualizar en BD
            const { error: updateError } = await _supabase
                .from('usuarios')
                .update({ password: nuevoPasswordHash })
                .eq('id', currentUser.id);
            
            if (updateError) throw updateError;
            
            notify("¡Contraseña actualizada con éxito! 🔒");
            
            // Limpiar campos
            document.getElementById('input-old-pass').value = '';
            document.getElementById('input-new-pass').value = '';
            document.getElementById('input-confirm-pass').value = '';
            
            setTimeout(cerrarModales, 1000);
            
        } catch (e) {
            notify(e.message, true);
        } finally {
            toggleLoading('btn-change-pass', false);
        }
    };
}

const btnCloseSettings = document.getElementById('btn-close-settings');
if (btnCloseSettings) btnCloseSettings.onclick = cerrarModales;

const btnCloseColors = document.getElementById('btn-close-colors');
if (btnCloseColors) btnCloseColors.onclick = cerrarModales;

const btnCloseCodes = document.getElementById('btn-close-codes');
if (btnCloseCodes) btnCloseCodes.onclick = cerrarModales;

const btnCloseLeaderboard = document.getElementById('btn-close-leaderboard');
if (btnCloseLeaderboard) btnCloseLeaderboard.onclick = cerrarModales;

const btnCloseMissions = document.getElementById('btn-close-missions');
if (btnCloseMissions) btnCloseMissions.onclick = cerrarModales;

const btnCloseChangelog = document.getElementById('btn-close-changelog');
if (btnCloseChangelog) btnCloseChangelog.onclick = cerrarModales;

const btnConfirmLogout = document.getElementById('btn-confirm-logout');
if (btnConfirmLogout) {
    btnConfirmLogout.onclick = () => {
        cerrarModales();
        logout();
    };
}

const btnCancelLogout = document.getElementById('btn-cancel-logout');
if (btnCancelLogout) btnCancelLogout.onclick = cerrarModales;

window.onclick = (event) => {
    if (event.target.classList.contains('modal')) cerrarModales();
};

const btnClaim12h = document.getElementById('btn-claim-12h');
const btnClaim24h = document.getElementById('btn-claim-24h');
if (btnClaim12h) btnClaim12h.onclick = () => reclamarMision(12);
if (btnClaim24h) btnClaim24h.onclick = () => reclamarMision(24);

const btnRedeemCode = document.getElementById('btn-redeem-code');
if (btnRedeemCode) {
    btnRedeemCode.onclick = async () => {
        const input = document.getElementById('input-code').value.trim().toUpperCase();
        if (!input) return notify("Escribe un código", true);
        
        toggleLoading('btn-redeem-code', true);
        try {
            const { data: codigo, error: errCod } = await _supabase.from('codigos').select('*').eq('codigo', input).maybeSingle();
            if (errCod) throw errCod;
            if (!codigo) throw new Error("Código no válido o expirado");

            const { data: usado } = await _supabase.from('codigos_usados').select('*').eq('usuario_id', currentUser.id).eq('codigo_id', codigo.id).maybeSingle();
            if (usado) throw new Error("Ya has canjeado este código 🎁");

            await _supabase.from('codigos_usados').insert([{ usuario_id: currentUser.id, codigo_id: codigo.id }]);

            let msg = "";
            if (codigo.recompensa_especial) {
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
}

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Iniciando Moon Play Dashboard...");
    
    // Esperar a que bcryptjs esté listo
    if (!hasher) {
        try {
            await waitForBcrypt();
        } catch (error) {
            console.error("❌ Error crítico al cargar bcryptjs:", error);
            notify("Error al cargar el sistema de seguridad", true);
        }
    }
    
    inicializarSistemaFeedback();
    console.log("✅ Sistema de feedback inicializado");
    
    const saved = localStorage.getItem('supabase_user');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            
            if (!parsed || !parsed.id || !parsed.usuario) {
                console.warn("⚠️ Datos de sesión incompletos - limpiando localStorage");
                localStorage.removeItem('supabase_user');
                return;
            }
            
            console.log("✅ Sesión encontrada en localStorage:", parsed.usuario);
            
            // 🔒 SEGURIDAD: Asegurar que no haya password
            delete parsed.password;
            currentUser = parsed;
            u = parsed; // Sincronizar variable global
            
            renderDashboard(parsed);
            console.log("✅ Dashboard renderizado con datos guardados");
            
            await refrescarDatosUsuario();
            console.log("✅ Datos sincronizados con la base de datos");
            
        } catch (e) {
            console.error("❌ Error al cargar sesión:", e);
            localStorage.removeItem('supabase_user');
        }
    } else {
        console.log("ℹ️ No hay sesión guardada - mostrando pantalla de login");
    }
});

// Consola Master (si existe)
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

// --- SISTEMA DE FEEDBACK ---
function abrirFeedback() {
    if (!currentUser) return;
    
    if (currentUser.rango === 'OWNER') {
        openModal('feedback-owner-modal');
        cargarFeedback();
    } else {
        document.getElementById('feedback-type').value = 'Asunto';
        const textArea = document.getElementById('feedback-text');
        textArea.value = '';
        actualizarContadorCaracteres();
        openModal('feedback-user-modal');
    }
}

function inicializarSistemaFeedback() {
    const feedbackTextArea = document.getElementById('feedback-text');
    if (feedbackTextArea) {
        feedbackTextArea.addEventListener('input', actualizarContadorCaracteres);
    }

    const btnSendFeedback = document.getElementById('btn-send-feedback');
    if (btnSendFeedback) {
        btnSendFeedback.onclick = async () => {
            const tipo = document.getElementById('feedback-type').value;
            const texto = document.getElementById('feedback-text').value.trim();
            
            if (!texto) return notify("Escribe un mensaje", true);
            if (texto.length < 10) return notify("El mensaje es muy corto (mínimo 10 caracteres)", true);
            
            toggleLoading('btn-send-feedback', true);
            
            try {
                const { error } = await _supabase.from('feedback').insert([{
                    usuario_id: currentUser.id,
                    usuario_nombre: currentUser.usuario,
                    tipo: tipo,
                    mensaje: texto,
                    fecha: new Date().toISOString()
                }]);
                
                if (error) throw error;
                
                notify("¡Comentario enviado con éxito! ✅");
                document.getElementById('feedback-text').value = '';
                setTimeout(cerrarModales, 1000);
                
            } catch (e) {
                notify("Error al enviar: " + e.message, true);
            } finally {
                toggleLoading('btn-send-feedback', false);
            }
        };
    }

    const btnLoadMoreFeedback = document.getElementById('btn-load-more-feedback');
    if (btnLoadMoreFeedback) {
        btnLoadMoreFeedback.onclick = () => cargarFeedback(true);
    }

    const btnCloseFeedbackUser = document.getElementById('btn-close-feedback-user');
    const btnCloseFeedbackOwner = document.getElementById('btn-close-feedback-owner');
    
    if (btnCloseFeedbackUser) btnCloseFeedbackUser.onclick = cerrarModales;
    if (btnCloseFeedbackOwner) btnCloseFeedbackOwner.onclick = cerrarModales;
}

function actualizarContadorCaracteres() {
    const textArea = document.getElementById('feedback-text');
    const counter = document.getElementById('char-counter');
    const status = document.getElementById('char-status');
    const btnSend = document.getElementById('btn-send-feedback');
    
    if (!textArea || !counter || !status || !btnSend) return;
    
    const length = textArea.value.length;
    const minLength = 10;
    
    counter.innerText = `${length} / ${minLength} caracteres mínimos`;
    
    if (length >= minLength) {
        counter.style.color = 'var(--primary)';
        status.innerText = '✓ Listo para enviar';
        status.style.color = 'var(--primary)';
        btnSend.disabled = false;
    } else {
        const remaining = minLength - length;
        counter.style.color = 'var(--text-muted)';
        status.innerText = `Faltan ${remaining} caracteres`;
        status.style.color = '#ef4444';
        btnSend.disabled = true;
    }
}

let feedbackOffset = 0;
const feedbackLimit = 10;
let hayMasFeedback = false;

async function cargarFeedback(esCargarMas = false) {
    const feedbackList = document.getElementById('feedback-list');
    const btnLoadMore = document.getElementById('btn-load-more-feedback');
    if (!feedbackList) return;
    
    if (!esCargarMas) {
        feedbackOffset = 0;
        feedbackList.innerHTML = "<p style='text-align:center; color:var(--text-muted); padding:20px;'>Cargando...</p>";
        if (btnLoadMore) btnLoadMore.classList.add('hidden');
    } else {
        if (btnLoadMore) {
            btnLoadMore.disabled = true;
            btnLoadMore.innerText = 'Cargando...';
        }
    }
    
    try {
        const { data, error } = await _supabase
            .from('feedback')
            .select('*')
            .order('fecha', { ascending: false })
            .range(feedbackOffset, feedbackOffset + feedbackLimit);
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            if (!esCargarMas) {
                feedbackList.innerHTML = "<p style='text-align:center; color:var(--text-muted); padding:40px 20px;'>No hay comentarios aún.</p>";
            }
            if (btnLoadMore) btnLoadMore.classList.add('hidden');
            return;
        }
        
        if (!esCargarMas) {
            feedbackList.innerHTML = '';
        }
        
        hayMasFeedback = data.length > feedbackLimit;
        const itemsAMostrar = hayMasFeedback ? data.slice(0, feedbackLimit) : data;
        
        itemsAMostrar.forEach(item => {
            const feedbackCard = document.createElement('div');
            feedbackCard.style.cssText = 'background: rgba(0,0,0,0.3); padding: 15px; border-radius: 12px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.05);';
            
            const fecha = new Date(item.fecha);
            const fechaFormato = fecha.toLocaleDateString('es-ES', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const tipoColor = item.tipo === 'Asunto' ? '#3ecf8e' : '#60a5fa';
            
            feedbackCard.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div>
                        <span style="color: white; font-weight: 600; font-size: 0.95rem;">${item.usuario_nombre}</span>
                        <span style="color: ${tipoColor}; font-size: 0.75rem; font-weight: 700; margin-left: 10px; background: rgba(0,0,0,0.3); padding: 3px 8px; border-radius: 6px;">${item.tipo}</span>
                    </div>
                    <span style="color: var(--text-muted); font-size: 0.75rem;">${fechaFormato}</span>
                </div>
                <p style="color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; margin: 0; white-space: pre-wrap;">${item.mensaje}</p>
            `;
            
            feedbackList.appendChild(feedbackCard);
        });
        
        feedbackOffset += itemsAMostrar.length;
        
        if (btnLoadMore) {
            if (hayMasFeedback) {
                btnLoadMore.classList.remove('hidden');
                btnLoadMore.disabled = false;
                btnLoadMore.innerText = 'Cargar más comentarios';
            } else {
                btnLoadMore.classList.add('hidden');
            }
        }
        
    } catch (e) {
        if (!esCargarMas) {
            feedbackList.innerHTML = "<p style='color:var(--error); text-align:center; padding:20px;'>Error al cargar comentarios</p>";
        } else {
            notify("Error al cargar más comentarios", true);
        }
        console.error("Error cargando feedback:", e);
        if (btnLoadMore) {
            btnLoadMore.disabled = false;
            btnLoadMore.innerText = 'Cargar más comentarios';
        }
    }
}