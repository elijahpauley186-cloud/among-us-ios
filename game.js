// --- GAME ENGINE SETUP ---
const canvas = document.getElementById("gameCanvas") || document.createElement("canvas");
if (!canvas.id) {
    canvas.id = "gameCanvas";
    document.body.appendChild(canvas);
}
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- STATE MACHINE ---
const gameState = {
    level: 1,
    phase: "START_SCREEN", // START_SCREEN, EXPLORE, TASK_MINIGAME, DIALOGUE, GAMEOVER, VICTORY, IMPOSTER_HUNT
    currentRole: "DETECTIVE", // DETECTIVE, IMPOSTER
    tasksCompleted: 0,
    tasksRequired: 5, // Lowered for faster testing
    crewInterrogatedCount: 0,
    crewInterrogatedRequired: 5,
    crewEliminatedCount: 0,
    crewEliminatedRequired: 3,
    activeNPC: null,
    dialogueStep: 0,
    sabotageActive: false,
    sabotageTimer: 400,
    globalPulse: 0,
    aiLoading: false
};

// --- ENTITIES & CONFIG ---
const player = {
    x: 850, y: 200, 
    width: 24, height: 34,
    speed: 6.0, // Slight speed boost for smoother navigation
    color: "#ff1e27", darkColor: "#b30006",
    facing: "right", isMoving: false, legCycle: 0, hp: 100
};

const map = { width: 1800, height: 1200 };

// --- FIX: Fully expanded coordinates matching image_4.png and image_5.png to enter right side rooms cleanly
const rooms = [
    { id: "cafeteria", name: "Cafeteria", x: 650, y: 80, w: 400, h: 260, color: "#252b36" },
    { id: "medbay", name: "MedBay", x: 550, y: 420, w: 180, h: 200, color: "#2e3745" },
    { id: "upper_engine", name: "Upper Engine", x: 220, y: 100, w: 220, h: 180, color: "#22252c" },
    { id: "reactor", name: "Reactor", x: 40, y: 320, w: 140, h: 300, color: "#3d2a2a" },
    { id: "security", name: "Security", x: 260, y: 360, w: 150, h: 160, color: "#22332a" },
    { id: "lower_engine", name: "Lower Engine", x: 220, y: 640, w: 220, h: 180, color: "#22252c" },
    { id: "electrical", name: "Electrical", x: 500, y: 700, w: 200, h: 240, color: "#342f3d" },
    { id: "storage", name: "Storage", x: 760, y: 720, w: 280, h: 280, color: "#333530" },
    
    // Expanded Right-Side Room Boxes
    { id: "admin", name: "Admin", x: 1100, y: 530, w: 240, h: 180, color: "#3d2b32" },
    { id: "weapons", name: "Weapons", x: 1120, y: 80, w: 260, h: 180, color: "#2a353d" },
    { id: "o2", name: "O2", x: 1220, y: 300, w: 200, h: 180, color: "#243623" },
    { id: "navigation", name: "Navigation", x: 1500, y: 360, w: 240, h: 240, color: "#1c2836" },
    { id: "shields", name: "Shields", x: 1180, y: 740, w: 260, h: 200, color: "#313745" }
];

// --- FIX: Widened hallway boxes to fully clear room borders and doorways
const hallways = [
    { x: 400, y: 150, w: 300, h: 80 },   
    { x: 1050, y: 140, w: 120, h: 90 },  
    { x: 140, y: 420, w: 150, h: 80 },   
    { x: 300, y: 200, w: 80, h: 900 },   
    { x: 700, y: 300, w: 80, h: 450 },   
    { x: 1050, y: 150, w: 100, h: 700 }, // Deep right spine connecting down past Admin
    { x: 1350, y: 420, w: 200, h: 100 }, // Broad Navigation entry point
    { x: 1140, y: 420, w: 120, h: 90 },  // Clean pathway into O2
    { x: 1260, y: 460, w: 90, h: 320 },  // Vertical corridor joining O2 and Shields
    { x: 400, y: 720, w: 400, h: 80 }    
];

const shipVents = [
    { x: 700, y: 120 }, { x: 300, y: 400 }, { x: 550, y: 750 }, { x: 1600, y: 500 }
];

const crewmates = [];
const crewColors = ["#00ffff", "#00ff00", "#ff00ff", "#ffff00", "#ffa500", "#ffffff", "#800080", "#008080", "#a52a2a", "#0000ff", "#55ff55", "#ff55ff", "#ffff55", "#55ffff", "#ff5555", "#999999", "#99ff99", "#ff99ff", "#9999ff", "#e67e22"];

for (let i = 0; i < 20; i++) {
    let targetRoom = rooms[i % rooms.length];
    crewmates.push({
        id: i, 
        name: `Crewmate-${i+1}`,
        x: targetRoom.x + 40 + Math.random() * (targetRoom.w - 80),
        y: targetRoom.y + 40 + Math.random() * (targetRoom.h - 80),
        room: targetRoom,
        color: crewColors[i], 
        darkColor: "#111111",
        vx: (Math.random() - 0.5) * 2, 
        vy: (Math.random() - 0.5) * 2,
        questioned: false, 
        isDead: false,
        talkCooldown: 0,
        lines: {
            intro: "Analyzing environment metadata...",
            reply1: "Systems running within normal operational boundaries.",
            reply2: "No irregular anomalies detected nearby."
        }
    });
}

// --- FIX: Added CORS proxy link to completely bypass client-side browser blocks ---
async function fetchGroqDialogue(npc) {
    gameState.aiLoading = true;
    const apiKey = "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"; 
    
    const promptText = `You are an Among Us crewmate named ${npc.name} standing in the room: ${npc.room.name}. Someone is investigating you. Generate 3 short sentences of dialogue for an Among Us game. 
    Line 1: An introductory defense line related to your room.
    Line 2: A suspicious answer to "What are you doing?".
    Line 3: An answer to "Seen anything suspect?".
    Output format must be strictly JSON text only. Format: {"intro": "Hi!", "reply1": "Doing wires.", "reply2": "Saw Blue venting."}`;

    // Standard public cross-origin mirror utility path
    const proxyUrl = "https://corsproxy.io/?";
    const targetUrl = "https://api.groq.com/openai/v1/chat/completions";

    try {
        const response = await fetch(proxyUrl + encodeURIComponent(targetUrl), {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama3-8b-8192",
                messages: [{ role: "user", content: promptText }],
                response_format: { type: "json_object" },
                temperature: 0.85
            })
        });
        
        const data = await response.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        npc.lines.intro = parsed.intro || npc.lines.intro;
        npc.lines.reply1 = parsed.reply1 || npc.lines.reply1;
        npc.lines.reply2 = parsed.reply2 || npc.lines.reply2;
    } catch (err) {
        console.warn("Groq CORS/Network error, applying alternate localized dialog patterns:", err);
        // Instant localized randomized variants context fallback
        const tasksMock = ["wiring fixes", "downloading telemetry data", "refueling engine systems", "clearing trash filters"];
        const suspectMock = ["I saw someone sneaking past the ventilation hubs...", "Cyan looks somewhat accountable.", "No suspicious actions logged on my sector."];
        npc.lines.intro = `Hey! Keeping up with adjustments here inside ${npc.room.name}.`;
        npc.lines.reply1 = `I am currently finishing up my ${tasksMock[Math.floor(Math.random() * tasksMock.length)]}.`;
        npc.lines.reply2 = suspectMock[Math.floor(Math.random() * suspectMock.length)];
    } finally {
        gameState.aiLoading = false;
    }
}

const shipTasks = [];
for (let i = 0; i < 20; i++) {
    let targetRoom = rooms[i % rooms.length];
    shipTasks.push({
        id: i,
        x: targetRoom.x + 30 + Math.random() * (targetRoom.w - 60),
        y: targetRoom.y + 30 + Math.random() * (targetRoom.h - 60),
        w: 24, h: 24, active: true
    });
}

const imposterBoss = { x: 0, y: 0, width: 44, height: 60, color: "#4a0d0d", darkColor: "#220000", hp: 100, speed: 4.0 };

// --- CONTROLLER HOOK INTERFACES ---
const joystick = { startX: 120, startY: canvas.height - 120, currentX: 120, currentY: canvas.height - 120, radius: 55, thumbRadius: 24, active: false, vx: 0, vy: 0 };
const attackBtn = { x: canvas.width - 130, y: canvas.height - 130, r: 48, pressed: false };
const interrogateBtn = { x: canvas.width - 130, y: canvas.height - 260, r: 44, active: false, nearTarget: null };

const diagBtn1 = { x: 60, y: canvas.height - 95, w: 220, h: 40 };
const diagBtn2 = { x: 300, y: canvas.height - 95, w: 220, h: 40 };

const keys = {};
window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

function isPointInsideWalkable(px, py) {
    for (let rm of rooms) {
        if (px >= rm.x && px <= rm.x + rm.w && py >= rm.y && py <= rm.y + rm.h) return true;
    }
    for (let hw of hallways) {
        if (px >= hw.x && px <= hw.x + hw.w && py >= hw.y && py <= hw.y + hw.h) return true;
    }
    return false;
}

function isPositionWalkable(x, y, w, h) {
    return isPointInsideWalkable(x, y) && 
           isPointInsideWalkable(x + w, y) && 
           isPointInsideWalkable(x, y + h) && 
           isPointInsideWalkable(x + w, y + h);
}

function resetGameData() {
    player.x = 850; player.y = 200; player.hp = 100;
    imposterBoss.hp = 100;
    gameState.tasksCompleted = 0; gameState.crewInterrogatedCount = 0; gameState.crewEliminatedCount = 0;
    gameState.phase = "EXPLORE"; gameState.currentRole = "DETECTIVE"; gameState.dialogueStep = 0; gameState.sabotageActive = false;
    shipTasks.forEach(t => { t.active = true; });
    crewmates.forEach(c => { c.questioned = false; c.isDead = false; c.talkCooldown = 0; });
}

// --- TOUCH HANDLING LAYERS ---
canvas.addEventListener("touchstart", async (e) => {
    const t = e.touches[0]; const mx = t.clientX; const my = t.clientY;

    if (gameState.phase === "START_SCREEN") {
        if (mx > canvas.width / 2 - 100 && mx < canvas.width / 2 + 100 && my > canvas.height / 2 + 20 && my < canvas.height / 2 + 80) gameState.phase = "EXPLORE";
        return;
    }
    if (gameState.phase === "GAMEOVER" || gameState.phase === "VICTORY") {
        if (mx > canvas.width / 2 - 90 && mx < canvas.width / 2 + 90 && my > canvas.height / 2 + 60 && my < canvas.height / 2 + 110) resetGameData();
        return;
    }
    if (gameState.phase === "TASK_MINIGAME") {
        if (mx > canvas.width / 2 - 60 && mx < canvas.width / 2 + 60 && my > canvas.height / 2 - 20 && my < canvas.height / 2 + 40) {
            let activeTask = shipTasks.find(t => t.active && checkBoxCollision(player, t));
            if (activeTask) {
                activeTask.active = false;
                gameState.tasksCompleted++;
                gameState.phase = "EXPLORE";
                checkPhaseTransition();
            }
        }
        return;
    }
    if (gameState.phase === "DIALOGUE") {
        if (mx > diagBtn1.x && mx < diagBtn1.x + diagBtn1.w && my > diagBtn1.y && my < diagBtn1.y + diagBtn1.h) { gameState.dialogueStep = 1; return; }
        if (mx > diagBtn2.x && mx < diagBtn2.x + diagBtn2.w && my > diagBtn2.y && my < diagBtn2.y + diagBtn2.h) { gameState.dialogueStep = 2; return; }
        if (my < canvas.height - 210 || mx > 550) {
            if (!gameState.activeNPC.questioned) {
                gameState.activeNPC.questioned = true;
                gameState.crewInterrogatedCount++;
            }
            gameState.activeNPC.talkCooldown = 180;
            gameState.phase = "EXPLORE"; gameState.dialogueStep = 0;
            checkPhaseTransition();
        }
        return;
    }
    
    if (gameState.phase === "EXPLORE" && interrogateBtn.active) {
        if (Math.hypot(mx - interrogateBtn.x, my - interrogateBtn.y) < interrogateBtn.r) {
            joystick.active = false;
            gameState.activeNPC = interrogateBtn.nearTarget;
            gameState.phase = "DIALOGUE";
            await fetchGroqDialogue(gameState.activeNPC);
            return;
        }
    }
    if (gameState.phase === "FIGHT" || gameState.phase === "IMPOSTER_HUNT") {
        if (Math.hypot(mx - attackBtn.x, my - attackBtn.y) < attackBtn.r) {
            attackBtn.pressed = true; keys["touch_attack"] = true; return;
        }
    }
    if (Math.hypot(mx - joystick.startX, my - joystick.startY) < joystick.radius + 25) {
        joystick.active = true; updateJoystick(mx, my);
    }
});

canvas.addEventListener("touchmove", (e) => {
    if (!joystick.active) return;
    e.preventDefault(); const t = e.touches[0]; updateJoystick(t.clientX, t.clientY);
}, { passive: false });

canvas.addEventListener("touchend", () => {
    joystick.active = false; joystick.currentX = joystick.startX; joystick.currentY = joystick.startY;
    joystick.vx = 0; joystick.vy = 0; player.isMoving = false; attackBtn.pressed = false;
});

function updateJoystick(tx, ty) {
    let dx = tx - joystick.startX, dy = ty - joystick.startY, dist = Math.hypot(dx, dy);
    if (dist > joystick.radius) {
        let angle = Math.atan2(dy, dx);
        joystick.currentX = joystick.startX + Math.cos(angle) * joystick.radius;
        joystick.currentY = joystick.startY + Math.sin(angle) * joystick.radius;
    } else {
        joystick.currentX = tx; joystick.currentY = ty;
    }
    joystick.vx = (joystick.currentX - joystick.startX) / joystick.radius;
    joystick.vy = (joystick.currentY - joystick.startY) / joystick.radius;
}

function drawAstronaut(x, y, facing, baseColor, shadowColor, legCycle, isMoving, isDead = false) {
    ctx.save(); ctx.translate(x, y);
    if (facing === "left") ctx.scale(-1, 1);
    
    if (isDead) {
        ctx.fillStyle = baseColor; ctx.beginPath(); ctx.roundRect(-12, 4, 24, 12, 4); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.fillRect(-3, -6, 6, 10);
        ctx.beginPath(); ctx.arc(-1, -6, 4, 0, Math.PI, true); ctx.arc(2, -6, 4, 0, Math.PI, true); ctx.fill();
        ctx.restore(); return;
    }

    ctx.fillStyle = "#0c0d12"; ctx.fillRect(-17, -10, 7, 24);
    ctx.fillStyle = baseColor; ctx.fillRect(-17, -10, 5, 24);
    let legOffset = isMoving ? Math.sin(legCycle * 0.4) * 5 : 0;
    ctx.fillStyle = "#0c0d12"; ctx.fillRect(-8, 10 + legOffset, 6, 8); ctx.fillRect(2, 10 - legOffset, 6, 8);
    ctx.fillStyle = baseColor; ctx.beginPath(); ctx.roundRect(-11, -16, 22, 28, 7); ctx.fill();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#639bff"; ctx.beginPath(); ctx.roundRect(1, -10, 12, 9, 4); ctx.fill(); ctx.stroke();
    ctx.restore();
}

function checkBoxCollision(r1, r2) {
    return r1.x < r2.x + (r2.w || r2.width) && r1.x + r1.width > r2.x && r1.y < r2.y + (r2.h || r2.height) && r1.y + r1.height > r2.y;
}

function updateAndRender() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    gameState.globalPulse++;

    if (gameState.phase === "START_SCREEN") {
        ctx.fillStyle = "#090b11"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ff1e27"; ctx.font = "bold 34px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(`AMONG US: DETECTIVE EVOLUTION`, canvas.width / 2, canvas.height / 2 - 50);
        ctx.fillStyle = "#1e2330"; ctx.strokeStyle = "#ff1e27"; ctx.beginPath(); ctx.roundRect(canvas.width / 2 - 110, canvas.height / 2 + 30, 220, 50, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "bold 15px sans-serif"; ctx.fillText("ENTER SHUTTLE", canvas.width / 2, canvas.height / 2 + 62);
        requestAnimationFrame(updateAndRender); return;
    }

    if (gameState.phase === "GAMEOVER" || gameState.phase === "VICTORY") {
        ctx.fillStyle = "#05060a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = gameState.phase === "VICTORY" ? "#2ee666" : "#ff3333";
        ctx.font = "bold 38px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(gameState.phase === "VICTORY" ? "IMPOSTER SUPREMACY!" : "MISSION TERMINATED", canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = "#1e222b"; ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.roundRect(canvas.width / 2 - 90, canvas.height / 2 + 40, 180, 50, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "15px sans-serif"; ctx.fillText("PLAY AGAIN", canvas.width / 2, canvas.height / 2 + 72);
        requestAnimationFrame(updateAndRender); return;
    }

    if (gameState.phase === "TASK_MINIGAME") {
        ctx.fillStyle = "rgba(10,13,20,0.97)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#fff"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("CALIBRATING ENGINE CONNECTIONS", canvas.width / 2, canvas.height / 2 - 60);
        ctx.fillStyle = "#dca114"; ctx.fillRect(canvas.width / 2 - 65, canvas.height / 2 - 10, 130, 50);
        ctx.fillStyle = "#000"; ctx.font = "bold 14px sans-serif"; ctx.fillText("SUBMIT", canvas.width / 2, canvas.height / 2 + 20);
        requestAnimationFrame(updateAndRender); return;
    }

    const camX = canvas.width / 2 - player.x, camY = canvas.height / 2 - player.y;

    if (gameState.phase === "EXPLORE" || gameState.phase === "FIGHT" || gameState.phase === "IMPOSTER_HUNT") {
        player.isMoving = false; let mx = 0, my = 0;
        if (keys["w"]) my = -1; if (keys["s"]) my = 1;
        if (keys["a"]) { mx = -1; player.facing = "left"; }
        if (keys["d"]) { mx = 1; player.facing = "right"; }
        if (joystick.active) { mx = joystick.vx; my = joystick.vy; if (Math.abs(joystick.vx) > 0.05) player.facing = joystick.vx > 0 ? "right" : "left"; }

        if (mx !== 0 && isPositionWalkable(player.x + mx * player.speed, player.y, player.width, player.height)) { player.x += mx * player.speed; player.isMoving = true; }
        if (my !== 0 && isPositionWalkable(player.x, player.y + my * player.speed, player.width, player.height)) { player.y += my * player.speed; player.isMoving = true; }
        if (player.isMoving) player.legCycle++;

        crewmates.forEach(c => { if (c.talkCooldown > 0) c.talkCooldown--; });

        crewmates.forEach(c => {
            if (c.isDead) return;
            let nextX = c.x + c.vx, nextY = c.y + c.vy;
            if (nextX > c.room.x + 25 && nextX < c.room.x + c.room.w - 35 && nextY > c.room.y + 25 && nextY < c.room.y + c.room.h - 35) {
                c.x = nextX; c.y = nextY;
            } else {
                c.vx = (Math.random() - 0.5) * 2.5; c.vy = (Math.random() - 0.5) * 2.5;
            }
        });

        let closestCrew = null; let minDistance = 75;
        crewmates.forEach(c => {
            if (c.isDead) return;
            let d = Math.hypot(player.x - c.x, player.y - c.y);
            if (d < minDistance) { minDistance = d; closestCrew = c; }
        });

        if (closestCrew) {
            interrogateBtn.active = (gameState.currentRole === "DETECTIVE" && closestCrew.talkCooldown <= 0);
            interrogateBtn.nearTarget = closestCrew;
        } else {
            interrogateBtn.active = false; interrogateBtn.nearTarget = null;
        }

        if (gameState.phase === "IMPOSTER_HUNT" && keys["touch_attack"]) {
            if (closestCrew && minDistance < 75) {
                closestCrew.isDead = true;
                gameState.crewEliminatedCount++;
                if (gameState.crewEliminatedCount >= gameState.crewEliminatedRequired) {
                    gameState.phase = "VICTORY";
                }
            }
            keys["touch_attack"] = false;
        }
    }

    ctx.save(); ctx.translate(camX, camY);
    ctx.fillStyle = "#101216"; ctx.fillRect(-200, -200, map.width + 400, map.height + 400);

    hallways.forEach(hw => {
        ctx.fillStyle = "#1b1e24"; ctx.fillRect(hw.x, hw.y, hw.w, hw.h);
        ctx.strokeStyle = "#282d38"; ctx.lineWidth = 2; ctx.strokeRect(hw.x, hw.y, hw.w, hw.h);
    });

    rooms.forEach(rm => {
        ctx.fillStyle = rm.color; ctx.fillRect(rm.x, rm.y, rm.w, rm.h);
        ctx.strokeStyle = "#404b5e"; ctx.lineWidth = 4; ctx.strokeRect(rm.x, rm.y, rm.w, rm.h);
        ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(rm.name, rm.x + rm.w / 2, rm.y + rm.h / 2);
    });

    shipVents.forEach(v => {
        ctx.fillStyle = "#444"; ctx.fillRect(v.x, v.y, 25, 18);
    });

    if (gameState.currentRole === "DETECTIVE") {
        shipTasks.forEach(t => {
            if (t.active) {
                ctx.fillStyle = "#f5b041"; ctx.fillRect(t.x, t.y, t.w, t.h);
                if (checkBoxCollision(player, t)) gameState.phase = "TASK_MINIGAME";
            }
        });
    }

    crewmates.forEach(c => {
        drawAstronaut(c.x, c.y, c.vx > 0 ? "right" : "left", c.color, c.darkColor, 0, !c.isDead, c.isDead);
    });

    if (gameState.phase === "FIGHT") {
        const angle = Math.atan2(player.y - imposterBoss.y, player.x - imposterBoss.x);
        imposterBoss.x += Math.cos(angle) * imposterBoss.speed; imposterBoss.y += Math.sin(angle) * imposterBoss.speed;
        drawAstronaut(imposterBoss.x, imposterBoss.y, Math.cos(angle) > 0 ? "right" : "left", imposterBoss.color, imposterBoss.darkColor, player.legCycle, true);

        if (keys["touch_attack"]) {
            if (Math.hypot(player.x - imposterBoss.x, player.y - imposterBoss.y) < 120) {
                imposterBoss.hp -= 20;
            }
            keys["touch_attack"] = false;
        }
        if (checkBoxCollision(player, { x: imposterBoss.x - 12, y: imposterBoss.y - 12, w: 24, h: 36 })) {
            player.hp -= 0.8; if (player.hp <= 0) gameState.phase = "GAMEOVER";
        }
        if (imposterBoss.hp <= 0) {
            gameState.currentRole = "IMPOSTER";
            player.color = "#a01a1a"; player.darkColor = "#400000";
            gameState.phase = "IMPOSTER_HUNT";
        }
    }

    drawAstronaut(player.x, player.y, player.facing, player.color, player.darkColor, player.legCycle, player.isMoving);
    ctx.restore();

    if (gameState.phase === "EXPLORE" || gameState.phase === "FIGHT" || gameState.phase === "IMPOSTER_HUNT") {
        ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.beginPath(); ctx.arc(joystick.startX, joystick.startY, joystick.radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#5c677d"; ctx.beginPath(); ctx.arc(joystick.currentX, joystick.currentY, joystick.thumbRadius, 0, Math.PI * 2); ctx.fill();
    }

    if (gameState.phase === "EXPLORE" && interrogateBtn.active) {
        ctx.fillStyle = "#2980b9"; ctx.beginPath(); ctx.arc(interrogateBtn.x, interrogateBtn.y, interrogateBtn.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(interrogateBtn.x - 16, interrogateBtn.y - 14, 32, 22, 4); ctx.fill();
        ctx.beginPath(); ctx.moveTo(interrogateBtn.x - 6, interrogateBtn.y + 8); ctx.lineTo(interrogateBtn.x - 12, interrogateBtn.y + 15); ctx.lineTo(interrogateBtn.x + 2, interrogateBtn.y + 8); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("ASK QUESTIONS", interrogateBtn.x, interrogateBtn.y + interrogateBtn.r + 16);
    }

    if (gameState.phase === "FIGHT" || gameState.phase === "IMPOSTER_HUNT") {
        ctx.fillStyle = "#ff1e27"; ctx.beginPath(); ctx.arc(attackBtn.x, attackBtn.y, attackBtn.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(gameState.currentRole === "IMPOSTER" ? "EXECUTE KILL" : "ATTACK BOSS", attackBtn.x, attackBtn.y + 5);
    }

    ctx.fillStyle = "rgba(13,16,24,0.92)"; ctx.fillRect(20, 20, 320, 115);
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(`ROLE: ${gameState.currentRole}`, 35, 45);
    if (gameState.currentRole === "DETECTIVE") {
        ctx.fillText(`TASKS DONE: ${gameState.tasksCompleted} / ${gameState.tasksRequired}`, 35, 70);
        ctx.fillText(`CREW QUESTIONED: ${gameState.crewInterrogatedCount} / ${gameState.crewInterrogatedRequired}`, 35, 95);
    } else {
        ctx.fillStyle = "#ff3333";
        ctx.fillText(`TARGETS ELIMINATED: ${gameState.crewEliminatedCount} / ${gameState.crewEliminatedRequired}`, 35, 70);
    }

    if (gameState.phase === "DIALOGUE" && gameState.activeNPC) {
        ctx.fillStyle = "rgba(9,12,20,0.99)"; ctx.strokeStyle = "#414b5e"; ctx.lineWidth = 3;
        ctx.fillRect(40, canvas.height - 210, canvas.width - 80, 150); ctx.strokeRect(40, canvas.height - 210, canvas.width - 80, 150);

        ctx.fillStyle = gameState.activeNPC.color; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`${gameState.activeNPC.name} (${gameState.activeNPC.room.name})`, 60, canvas.height - 175);

        ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif";
        let displayPrompt = gameState.aiLoading ? "Generating real-time responses..." : gameState.activeNPC.lines.intro;
        if (gameState.dialogueStep === 1) displayPrompt = gameState.activeNPC.lines.reply1;
        if (gameState.dialogueStep === 2) displayPrompt = gameState.activeNPC.lines.reply2;
        ctx.fillText(`"${displayPrompt}"`, 60, canvas.height - 140);

        if (!gameState.aiLoading) {
            ctx.fillStyle = "#202533"; ctx.fillRect(diagBtn1.x, diagBtn1.y, diagBtn1.w, diagBtn1.h);
            ctx.fillStyle = "#fff"; ctx.font = "12px sans-serif"; ctx.fillText("1. What are you doing?", diagBtn1.x + 15, diagBtn1.y + 24);

            ctx.fillStyle = "#202533"; ctx.fillRect(diagBtn2.x, diagBtn2.y, diagBtn2.w, diagBtn2.h);
            ctx.fillStyle = "#fff"; ctx.fillText("2. Seen anything suspect?", diagBtn2.x + 15, diagBtn2.y + 24);
        }
    }

    requestAnimationFrame(updateAndRender);
}

function checkPhaseTransition() {
    if (gameState.currentRole === "DETECTIVE" && gameState.tasksCompleted >= gameState.tasksRequired && gameState.crewInterrogatedCount >= gameState.crewInterrogatedRequired) {
        gameState.phase = "FIGHT";
        imposterBoss.x = player.x - 120; imposterBoss.y = player.y - 120;
    }
}

window.addEventListener("resize", () => {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    joystick.startY = canvas.height - 120; joystick.currentY = joystick.startY;
    attackBtn.x = canvas.width - 130; attackBtn.y = canvas.height - 130;
    interrogateBtn.x = canvas.width - 130; interrogateBtn.y = canvas.height - 260;
});

updateAndRender();
