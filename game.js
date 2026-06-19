// Phaser Game Configuration
const config = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.FIT, // Auto-scales to fit any iPad screen size
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 }, // 2D top-down game uses no gravity
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

let player;
let joystickBase;
let joystickThumb;
let isDragging = false;
let moveVector = { x: 0, y: 0 };
const playerSpeed = 250;

function preload() {
    // Standard Phaser geometric shapes used as temporary placeholders 
    // to avoid asset loading crashes on your first build.
}

function create() {
    // 1. Create a simple grid floor background
    const grid = this.add.grid(640, 360, 2560, 1440, 64, 64, 0x222222).setAltFillStyle(0x1a1a1a);
    
    // Set map boundaries
    this.physics.world.setBounds(0, 0, 2560, 1440);

    // 2. Generate a temporary Crewmate Sprite (Red Capsule)
    const playerGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    playerGraphics.fillStyle(0xff0000, 1); // Red Crewmate suit
    playerGraphics.fillRoundedRect(0, 0, 40, 60, 15);
    playerGraphics.fillStyle(0x88ccff, 1); // Blue Visor glass
    playerGraphics.fillRoundedRect(20, 10, 25, 18, 5);
    playerGraphics.generateTexture('crewmate', 50, 60);

    // 3. Spawn the Player Character
    player = this.physics.add.sprite(640, 360, 'crewmate');
    player.setCollideWorldBounds(true);

    // Camera follow mechanics
    this.cameras.main.setBounds(0, 0, 2560, 1440);
    this.cameras.main.startFollow(player, true, 0.1, 0.1);

    // 4. Interface Touch Joystick Logic (Left Side Screen Focus)
    joystickBase = this.add.circle(150, 570, 60, 0xffffff, 0.2).setScrollFactor(0);
    joystickThumb = this.add.circle(150, 570, 25, 0xffffff, 0.5).setScrollFactor(0);

    this.input.on('pointerdown', (pointer) => {
        // Only trigger joystick if tapping on the left third of the iPad screen
        if (pointer.x < 400) {
            isDragging = true;
            joystickBase.setPosition(pointer.x, pointer.y);
            joystickThumb.setPosition(pointer.x, pointer.y);
        }
    });

    this.input.on('pointermove', (pointer) => {
        if (!isDragging) return;

        // Calculate distance and angles between center point and current drag touch
        const angle = Phaser.Math.Angle.Between(joystickBase.x, joystickBase.y, pointer.x, pointer.y);
        const distance = Phaser.Math.Distance.Between(joystickBase.x, joystickBase.y, pointer.x, pointer.y);
        const maxDistance = 60;

        if (distance < maxDistance) {
            joystickThumb.setPosition(pointer.x, pointer.y);
            // Normalize scale vector values between -1 and 1
            moveVector.x = (pointer.x - joystickBase.x) / maxDistance;
            moveVector.y = (pointer.y - joystickBase.y) / maxDistance;
        } else {
            // Cap thumb movement to stay within boundary ring circumference
            const targetX = joystickBase.x + Math.cos(angle) * maxDistance;
            const targetY = joystickBase.y + Math.sin(angle) * maxDistance;
            joystickThumb.setPosition(targetX, targetY);
            moveVector.x = Math.cos(angle);
            moveVector.y = Math.sin(angle);
        }
    });

    this.input.on('pointerup', () => {
        isDragging = false;
        // Reset joystick elements back to resting defaults
        joystickBase.setPosition(150, 570);
        joystickThumb.setPosition(150, 570);
        moveVector.x = 0;
        moveVector.y = 0;
    });
}

function update() {
    // Apply movement speeds every frame step based on active vector calculations
    if (isDragging) {
        player.setVelocityX(moveVector.x * playerSpeed);
        player.setVelocityY(moveVector.y * playerSpeed);

        // Turn character left or right dynamically based on direction vector polarity
        if (moveVector.x < 0) {
            player.flipX = true;
        } else if (moveVector.x > 0) {
            player.flipX = false;
        }
    } else {
        player.setVelocity(0); // Instantly stop drifting when finger lifts off screen
    }
}
