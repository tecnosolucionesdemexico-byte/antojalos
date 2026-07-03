<?php
/**
 * API Backend for Antó-Jalos Digital Menu
 * Handles authentication, menu and config persistence, and image uploads.
 */

// Enable error reporting for debugging, but disable in production if preferred
ini_set('display_errors', 0);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Start PHP Session
session_start();

$menuFile = __DIR__ . '/data/menu.json';
$configFile = __DIR__ . '/data/config.json';
$uploadsDir = __DIR__ . '/uploads';

// Ensure directories exist
if (!file_exists(__DIR__ . '/data')) {
    mkdir(__DIR__ . '/data', 0755, true);
}
if (!file_exists($uploadsDir)) {
    mkdir($uploadsDir, 0755, true);
}

// Helper to send json response
function sendResponse($status, $message, $data = null) {
    echo json_encode([
        'status' => $status,
        'message' => $message,
        'data' => $data
    ]);
    exit;
}

// Helper to check authentication
function isAuthenticated() {
    if (isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true) {
        return true;
    }
    
    // Fallback: check authorization header (token could be SHA256 of password)
    $headers = apache_request_headers();
    $authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : '';
    if (empty($authHeader) && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    }
    
    if (!empty($authHeader)) {
        $token = str_replace('Bearer ', '', $authHeader);
        $config = json_decode(@file_get_contents(__DIR__ . '/data/config.json'), true);
        if ($config && isset($config['adminPasswordHash'])) {
            if ($token === $config['adminPasswordHash']) {
                $_SESSION['authenticated'] = true;
                return true;
            }
        }
    }
    
    return false;
}

// Determine action
$action = isset($_GET['action']) ? $_GET['action'] : '';

// 1. GET DATA (Publicly accessible)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'get_menu') {
        if (file_exists($menuFile)) {
            echo file_get_contents($menuFile);
        } else {
            echo json_encode([]);
        }
        exit;
    }
    
    if ($action === 'get_config') {
        if (file_exists($configFile)) {
            $config = json_decode(file_get_contents($configFile), true);
            // Hide password hash from public response for security
            if ($config) {
                unset($config['adminPasswordHash']);
            }
            echo json_encode($config);
        } else {
            echo json_encode(['businessName' => 'Antó-Jalos']);
        }
        exit;
    }
}

// 2. POST ACTIONS
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // LOGIN
    if ($action === 'login') {
        $input = json_decode(file_get_contents('php://input'), true);
        $password = isset($input['password']) ? $input['password'] : '';
        
        if (empty($password)) {
            sendResponse('error', 'Contraseña requerida');
        }
        
        $config = json_decode(@file_get_contents($configFile), true);
        if (!$config) {
            sendResponse('error', 'Error de configuración del servidor');
        }
        
        $expectedHash = isset($config['adminPasswordHash']) ? $config['adminPasswordHash'] : '';
        $inputHash = hash('sha256', $password);
        
        if ($inputHash === $expectedHash || $password === $expectedHash) {
            $_SESSION['authenticated'] = true;
            sendResponse('success', 'Sesión iniciada correctamente', [
                'token' => $expectedHash
            ]);
        } else {
            sendResponse('error', 'Contraseña incorrecta');
        }
    }
    
    // Check auth for all other post actions
    if (!isAuthenticated()) {
        header('HTTP/1.0 401 Unauthorized');
        sendResponse('error', 'No autorizado');
    }
    
    // LOGOUT
    if ($action === 'logout') {
        $_SESSION['authenticated'] = false;
        session_destroy();
        sendResponse('success', 'Sesión cerrada');
    }
    
    // SAVE MENU
    if ($action === 'save_menu') {
        $rawJson = file_get_contents('php://input');
        // Validate JSON
        $decoded = json_decode($rawJson, true);
        if ($decoded === null) {
            sendResponse('error', 'JSON inválido');
        }
        
        if (file_put_contents($menuFile, $rawJson) !== false) {
            sendResponse('success', 'Menú guardado correctamente');
        } else {
            sendResponse('error', 'No se pudo escribir en el archivo del menú');
        }
    }
    
    // SAVE CONFIG
    if ($action === 'save_config') {
        $rawJson = file_get_contents('php://input');
        $decoded = json_decode($rawJson, true);
        if ($decoded === null) {
            sendResponse('error', 'JSON inválido');
        }
        
        // Merge with existing config to preserve password hash if not sent
        $existing = json_decode(@file_get_contents($configFile), true);
        if ($existing) {
            if (!isset($decoded['adminPasswordHash']) && isset($existing['adminPasswordHash'])) {
                $decoded['adminPasswordHash'] = $existing['adminPasswordHash'];
            }
            // Allow changing password
            if (isset($decoded['newPassword']) && !empty($decoded['newPassword'])) {
                $decoded['adminPasswordHash'] = hash('sha256', $decoded['newPassword']);
            }
            unset($decoded['newPassword']);
        }
        
        if (file_put_contents($configFile, json_encode($decoded, JSON_PRETTY_PRINT)) !== false) {
            sendResponse('success', 'Configuración guardada correctamente');
        } else {
            sendResponse('error', 'No se pudo escribir en la configuración');
        }
    }
    
    // UPLOAD IMAGE
    if ($action === 'upload_image') {
        if (!isset($_FILES['image'])) {
            sendResponse('error', 'No se recibió ninguna imagen');
        }
        
        $file = $_FILES['image'];
        $fileName = $file['name'];
        $fileTmpName = $file['tmp_name'];
        $fileSize = $file['size'];
        $fileError = $file['error'];
        
        if ($fileError !== 0) {
            sendResponse('error', 'Error al subir el archivo');
        }
        
        $fileExt = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $allowed = array('jpg', 'jpeg', 'png', 'gif', 'webp');
        
        if (!in_array($fileExt, $allowed)) {
            sendResponse('error', 'Tipo de archivo no permitido. Solo se permiten imágenes (jpg, jpeg, png, gif, webp)');
        }
        
        // Max 5MB
        if ($fileSize > 5 * 1024 * 1024) {
            sendResponse('error', 'El archivo es demasiado grande (máximo 5MB)');
        }
        
        $newFileName = uniqid('prod_', true) . '.' . $fileExt;
        $fileDestination = $uploadsDir . '/' . $newFileName;
        
        if (move_uploaded_file($fileTmpName, $fileDestination)) {
            // Determine relative url
            $url = 'uploads/' . $newFileName;
            sendResponse('success', 'Imagen subida correctamente', ['url' => $url]);
        } else {
            sendResponse('error', 'Error al guardar la imagen en el servidor');
        }
    }
}

sendResponse('error', 'Acción no soportada');
?>
