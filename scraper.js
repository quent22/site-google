// On importe 'chromium' depuis playwright
const { chromium } = require('playwright');
const fs = require('fs');
require('dotenv').config();

// Liste des matières à ignorer (inchangée)
const matieresAIgnorer = ["INFOS IMPORTANTES", "MÉTHODOLOGIE", "Méthodologie générale"];

/**
 * Nettoie le nom brut d'un livret pour extraire le nom du chapitre. (Fonction inchangée)
 * Ex: "L1SPS-08-UE2-Enzymes-Partie2-S39" -> "Enzymes"
 * Ex: "L1SPS-12-UE1-Aspects quantitatifs-S40" -> "Aspects quantitatifs"
 * @param {string} rawName - Le nom brut du livret.
 * @returns {string|null} - Le nom du chapitre nettoyé ou null.
 */
function nettoyerNomChapitre(rawName) {
    if (!rawName) return null;
    let name = rawName.replace(/^[A-Z0-9-]+-UE\d-/, '')
                      .replace(/-S\d{2,}$/, '')
                      .replace(/-Partie\d+/i, '')
                      .trim();
    name = name.replace(/-/g, ' ');
    return name;
}


async function scraper() {
    console.log('[LOG] Lancement du scraper...');
    // Lancement d'un navigateur Chromium avec Playwright
    const browser = await chromium.launch({ headless: true }); // Mettre `false` pour voir le navigateur
    const page = await browser.newPage();

    try {
        console.log('[LOG] Connexion au site...');
        // On utilise 'load' comme état d'attente pour Playwright
        await page.goto('https://strasbourg.monespaceprepa.fr/', { waitUntil: 'load' });

        // Votre syntaxe originale était la bonne !
        await page.getByLabel("Identifiant").fill(process.env.LOGIN_USERNAME);
        await page.getByLabel('Mot de passe').fill(process.env.LOGIN_PASSWORD);
        await page.getByRole('button', { name: 'Se connecter' }).click();
        
        // La gestion de l'A2F reste similaire
        try {
            await page.waitForSelector('text=Code de validation', { timeout: 5000 });
            console.log("[INFO] Page A2F détectée. Veuillez entrer le code manuellement si le navigateur est visible.");
            // Playwright attendra la navigation après validation du code A2F
            await page.waitForURL('https://strasbourg.monespaceprepa.fr/accueil', { waitUntil: 'load', timeout: 60000 });
        } catch (e) {
            console.log("[INFO] La page A2F n'a pas été demandée.");
        }
        
        // Attente de l'URL de l'accueil pour confirmer la connexion
        await page.waitForURL('https://strasbourg.monespaceprepa.fr/accueil', { waitUntil: 'load' });
        console.log('[SUCCESS] Connexion réussie !');
        
        console.log("[LOG] Navigation vers la page des matières...");
        await page.goto('https://strasbourg.monespaceprepa.fr/mes_matieres.php', { waitUntil: 'load' });
        
        // On utilise `locator` et `evaluateAll` de Playwright
        const subjectLocator = page.locator('a[href*="id_matiere="]');
        let subjects = await subjectLocator.evaluateAll(links => 
            links.map(link => ({ title: link.innerText.trim(), url: link.href }))
        );

        subjects = subjects.filter(subject => !matieresAIgnorer.includes(subject.title));
        console.log(`[LOG] ${subjects.length} matières pertinentes trouvées.`);

        const finalData = [];

        for (const subject of subjects) {
            console.log(`[LOG] Traitement de la matière : ${subject.title}`);
            await page.goto(subject.url, { waitUntil: 'load' });

            const chapterLocator = page.locator('.nom-cours');
            const rawChapterNames = await chapterLocator.allInnerTexts();

            const cleanedChapters = new Set();
            for (const rawName of rawChapterNames) {
                const cleanedName = nettoyerNomChapitre(rawName);
                if (cleanedName) {
                    cleanedChapters.add(cleanedName);
                }
            }

            finalData.push({
                matiere: subject.title,
                chapitres: Array.from(cleanedChapters)
            });
        }

        fs.writeFileSync('data.json', JSON.stringify(finalData, null, 2));
        console.log('[SUCCESS] Le fichier data.json a été créé avec succès !');

    } catch (error) {
        console.error('[ERROR] Une erreur est survenue :', error);
    } finally {
        await browser.close();
        console.log('[LOG] Navigateur fermé.');
    }
}

scraper();