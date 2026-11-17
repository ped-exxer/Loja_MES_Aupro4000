-- Roda só na primeira subida do MySQL (volume vazio): duas bases, cada uma com o seu usuário, que só enxerga a sua.
-- A Loja nunca acessa a base "mes" (nem o contrário): os dois sistemas conversam só por HTTP.
-- Senhas fixas (instalação offline e local); se trocar aqui, troque também no docker-compose.yml.

CREATE DATABASE IF NOT EXISTS loja CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS mes CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'loja'@'%' IDENTIFIED BY 'loja';
CREATE USER IF NOT EXISTS 'mes'@'%' IDENTIFIED BY 'mes';

GRANT ALL PRIVILEGES ON loja.* TO 'loja'@'%';
GRANT ALL PRIVILEGES ON mes.* TO 'mes'@'%';
FLUSH PRIVILEGES;
