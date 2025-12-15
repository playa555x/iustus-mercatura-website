const fs = require('fs');
const path = '/d/iustus-mercatura-website/server.ts';
let content = fs.readFileSync(path, 'utf8');

// Find and replace the serveStatic function
const oldCode = `return new Response(bunFile, {
                headers: { ...headers, "Content-Type": contentType },
            });`;

const newCode = `// Add cache headers based on file type
            const cacheHeaders = { ...headers, "Content-Type": contentType };
            
            // Cache static assets for 1 year
            if (ext === '.css' || ext === '.js' || ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp' || ext === '.svg' || ext === '.woff' || ext === '.woff2') {
                cacheHeaders["Cache-Control"] = "public, max-age=31536000, immutable";
            } 
            // Don't cache HTML
            else if (ext === '.html') {
                cacheHeaders["Cache-Control"] = "no-cache, must-revalidate";
            }
            
            return new Response(bunFile, { headers: cacheHeaders });`;

content = content.replace(oldCode, newCode);
fs.writeFileSync(path, content, 'utf8');
console.log('✅ Cache headers added!');
