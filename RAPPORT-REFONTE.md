# Audit et compte rendu de refonte PAL-UCA — 10 octobre 2026

## Architecture auditée
Le projet existant utilise des pages HTML et des scripts publics, servies par Vite/Express. Les routes Vercel réutilisent `src/apiRouter.ts`. Les profils, sessions, créneaux, rendez-vous et catalogues passent par `src/persistentStore.ts` : fichier JSON en local, Blob chiffré et révisions immuables avec contrôle ETag sur Vercel. Aucun nouveau fournisseur IA ni nouvelle base n’a été ajouté.
L’extraction CV existe dans `src/cvAuditPipeline.ts` : pdf-parse, mammoth, Gemini et Mistral. Les listes normalisées reposent sur `src/referentielUCA.ts` et `src/normalizationService.ts`. Le questionnaire existant est défini dans `espace.html`. Le barème est conservé : oui=1, partiel=0,5, non=0 ; textes de compétences/qualités >=5 caractères=1.

## Modifications
- `src/accompaniment.ts` : validation des réponses obligatoires, calcul des quatre scores et sept règles de prescription explicites. Aucun seuil de prescription par défaut inventé. TERRITOIRE n’entraîne aucune prescription autonome sans configuration.
- `src/workflow.ts` : brouillons persistants, configuration versionnée des seuils, diagnostic qualitatif par dimension, validation du conseiller conservant diagnostic initial et final, enregistrement des entretiens, prescriptions, suivis successifs, recherches et statistiques réelles. Clôture répétée et compte rendu incomplet refusés.
- `src/apiRouter.ts` : réservation après questionnaire sans exiger fiabilisation préalable ; identifiants uniques ; interdiction de réaliser un entretien avec le simple changement de statut ; identité du candidat masquée dans les disponibilités aux autres lauréats.
- `src/cvAuditPipeline.ts`, `inscription.html` : conservation des diplômes, expériences, stages, formations et certifications structurés ; appariement conservateur des listes, avec refus des correspondances ambiguës.
- `public/laureat-workflow.js`, `public/accompaniment-laureat.js`, `espace.html` : questionnaire séquentiel, progression, sauvegarde de brouillon, reprise, diagnostic et réservation. Les prestations restent soumises à fiabilisation et premier entretien réalisé.
- `public/admin-workflow.js`, `public/accompaniment-admin.js`, `admin.html` : observations et synthèse professionnelles, sélection des ateliers validés, formulaire de clôture de l’entretien, prochain suivi indicatif, vue des suivis et indicateurs filtrables.
- Annulation/archivage des rendez-vous préserve les données. Les suivis indicatifs ne créent pas de rendez-vous confirmé.

## Données et migrations
Extension additive des objets profils : `questionnaireDraft`, `diagnosticValidations`, `entretiens`, `prescriptionHistory`, `suivis` ; configuration centrale `diagnosticConfig` et historique. Pas de migration SQL, pas de suppression de dossiers ni d’écriture en production. La migration existante de schéma version 2 reste en place. Les bases de tests sont isolées dans `.private`.

## Tests exécutés
- `npm run lint` : succès.
- `npm run build` : succès.
- `node --import tsx scripts/test-prescription.ts` : succès des sept règles, conservation du barème, refus des réponses obligatoires vides et absence de prescription TERRITOIRE inventée.
- `node --import tsx scripts/test-cv-content.ts` : succès de lecture du contenu d’un fichier texte, extraction email/téléphone, date absente non inventée et refus d’un nom de fichier sans contenu. Extraction heuristique, sans appel IA.
- `node --import tsx scripts/test-workflow.ts` : 48 contrôles API réussis. Inclut inscription manuelle/avec document conservé, autorisations, questionnaire et brouillon, diagnostic IA simulé, fiabilisation, réservation avant fiabilisation, deux réservations simultanées (une seule enregistrée), acceptation, reprogrammation atomique, interdiction des écritures génériques de rendez-vous, entretien incomplet, entretien réalisé/absent/reporté, prescriptions, suivi, historique et statistiques.
- `node --import tsx scripts/test-browser.mjs` : succès Chromium ordinateur/mobile/tablette ; recherches, dossier, fiabilisation, réservation accessible après questionnaire, formulaire d’entretien, validation obligatoire, clôture avec suivi, indicateurs et suivis, logos et absence d’erreurs JavaScript.

- `node --import tsx scripts/test-cv-live.ts` : échec attendu du contrôle exigeant Gemini réel, car aucun modèle n’a répondu avec succès (503 puis délais dépassés). Le repli heuristique ne constitue pas une validation de l’extraction IA. Test externe lancé après autorisation explicite de l’utilisateur pour les seules données fictives.

## Limites et travail restant
La demande globale n’est pas entièrement achevée. Les validations ci-dessus ne prouvent pas l’exhaustivité de l’extraction des PDF, DOCX, scans ou CV multilingues en conditions réelles. Un test Gemini réel a été autorisé et exécuté sur un CV entièrement fictif : échec du fournisseur (503 UNAVAILABLE puis délais dépassés), retour à l’extraction heuristique. Aucun test Mistral réel ni déploiement n’a été réalisé. Le test « inscription avec CV » vérifie la conservation du document, pas son extraction complète.
Restent à compléter : niveaux de maîtrise avec plusieurs seuils configurables ; sélection qualitative IA entre les alternatives OU (le moteur actuel utilise les réponses et scores de manière déterministe) ; besoin individuel de lettre de motivation (pas de question spécifique existante : aucune prescription ciblée inventée) ; interface complète d’administration des règles et listes normalisées ; passage des prestations prescrites à programmées/réalisées avec validation des séances effectivement tenues ; harmonisation exhaustive des menus, icônes et anciens libellés ; vérification complémentaire des fonctionnalités éditoriales existantes ; validation de la persistance/concurrence et des accès aux documents sur Vercel.
La capacité des créneaux demeure individuelle (une place), conformément au comportement existant ; les capacités multiples demandent une extension dédiée.
Le site publié n’a pas pu être inspecté avec l’outil web. Les résultats concernent la version locale du projet.

## Mise à jour après la suppression demandée

Le 10 octobre 2026, à la demande explicite de l’utilisateur, les dossiers ont été
supprimés de la base active après correction et vérification du back-office.
L’aperçu présente maintenant les quatre dimensions, les scores issus du
questionnaire complet, l’analyse CV disponible et les prestations suggérées avec
leurs sources. L’extraction du CV ne renseigne plus automatiquement les réponses
au questionnaire. La validation des scores reste indépendante du modèle IA.

Les 8 aperçus de production ont été vérifiés avant suppression. Aucun de ces
anciens dossiers ne contenait un questionnaire complet ni un diagnostic IA prêt ;
les informations manquantes étaient donc signalées. Un dossier fictif complet,
avec diagnostic IA simulé, a validé l’affichage des quatre scores et les
justifications provenant du questionnaire et du CV dans le navigateur local.

Suppression de production : 8 lauréats, 7 rendez-vous, 3 inscriptions et 1 session
lauréat. Les catalogues ont été comparés avant/après et sont conservés. Les
indicateurs du nouveau parcours sont à zéro. Une sauvegarde chiffrée côté serveur
est conservée ; cette suppression ne constitue pas une purge des sauvegardes.
Le fichier initial local a aussi été vidé de ses 7 dossiers, 6 rendez-vous et
3 inscriptions, après sauvegarde chiffrée. Les anciennes données du navigateur
ne peuvent plus réimporter les dossiers supprimés.

Nouveaux composants : `src/advisorDiagnostic.ts`, `src/laureatReset.ts`, affichage
`public/admin-workflow.js`, styles `public/institutional.css`, persistance de
l’analyse CV dans `inscription.html` et `espace.html`, sauvegarde chiffrée et
opération administrative protégée dans `src/persistentStore.ts` et
`src/workflow.ts`.

Validation : TypeScript et build réussis ; 49 contrôles API réussis ; tests du
nouvel aperçu et de la suppression sur base fictive réussis ; navigateur
ordinateur/mobile réussi ; vérification des 8 aperçus réels avant suppression.
Les tests ne valident pas la disponibilité actuelle de Gemini ni une extraction
exhaustive des PDF scannés. Les limites métier précédemment listées, qui ne sont
pas couvertes par cette mise à jour, restent applicables.

## Stockage permanent

À la demande de l’utilisateur, l’enregistrement durable a été confirmé et
renforcé pour les bannières et les nouveaux profils. Les nouvelles images de
bannières utilisent Vercel Blob ; les métadonnées et profils continuent à passer
par le stockage chiffré existant, sans changement de fournisseur ni de clé.
Les trois images existantes ont été migrées vers Blob sans changer leur contenu
ni le nombre de bannières. La liste opérationnelle conserve zéro lauréat.

Les confirmations d’ajout, d’activation et de suppression des bannières attendent
maintenant le serveur. Le cache du navigateur n’est plus fusionné avec les
collections serveur, et une bannière supprimée ne peut pas être réimportée par
une ancienne copie.

Tests locaux réussis : profils et bannières conservés après redémarrage ; image
accessible ; sauvegarde des médias Vercel simulée avec succès et échec ; ajout,
rechargement, activation, suppression et erreur de sauvegarde testés dans le
navigateur ; 49 contrôles du parcours et tests navigateur existants réussis.

Contrôle réel après redéploiement réussi le 10 octobre 2026 : trois bannières
identiques retrouvées, trois images Blob accessibles, échantillon interne fictif
de profil et de bannière retrouvé avec le même checksum. Le contrôle a ensuite
été retiré ; aucun lauréat n’a été créé dans la liste opérationnelle, qui reste
vide. Ce test valide la conservation dans le stockage chiffré indépendamment du
déploiement. Les inscriptions réelles ont été testées sur base locale avec
redémarrage ; aucun profil réel n’a été ajouté en production pour ce contrôle.

## Diagnostic réservé au back office et file de fiabilisation

Le diagnostic IA détaillé est retiré de l’espace candidat et des réponses API du
candidat. Le statut de génération, les réponses et les scores du questionnaire
restent disponibles pour le parcours. Les analyses complètes, anciennes versions
et validations restent conservées et accessibles dans le back-office.

La rubrique Fiabilisation ne liste que les dossiers encore à traiter. Une
validation réussie ferme le dossier et actualise immédiatement cette file ; le
profil est toujours conservé dans Consulter les profils. Le filtrage est appliqué
côté serveur avant pagination et recherche.

Les lectures du stockage utilisent l’origine Blob sans cache CDN et reprennent
les erreurs transitoires. Une absence du stockage de production ne provoque plus
une réinitialisation automatique avec le fichier initial. La cause exacte de
l’erreur de stockage montrée sur la capture n’a pas pu être reproduite ; la
connexion administrateur est opérationnelle lors de la vérification.

Validation locale : TypeScript et build réussis, 56 contrôles API réussis,
tests navigateur ordinateur/mobile réussis, tests de lecture du stockage avec
indisponibilité transitoire et chiffrement invalide réussis. Aucun dossier réel
n’a été fiabilisé ou supprimé pour ces vérifications.

Vérification après publication réussie : connexion conseiller opérationnelle,
diagnostic détaillé présent dans le back-office, bloc détaillé retiré du script
candidat, un profil conservé dans les dossiers et zéro dossier dans la file de
fiabilisation. Le profil réel n’a pas été modifié pendant ce contrôle.

## Recherche des lauréats — 11 octobre 2026

Les journaux de production confirment des réponses 503 sur pal-uca.vercel.app.
Le dossier recherché existe : la recherche SALMA retourne un résultat sur les
deux adresses de production. L'incident exact n'a pas été reproduit pendant le
contrôle. Les erreurs du SDK Blob portent souvent le nom générique Error : les
reprises reconnaissent désormais leurs classes réelles, notamment limitation
de débit, indisponibilité et interruption. Les journaux indiquent leur classe
sans afficher les données ou les secrets.

Le client reprend jusqu'à trois fois les lectures HTTP 502/503/504, jamais les
écritures. Une erreur provenant d'une recherche ancienne ne remplace plus le
résultat courant ; la soumission annule le déclenchement différé redondant.
Le SDK ignore useCache:false pour un Blob public ; la cohérence repose sur
la référence autoritative obtenue par head et les révisions immuables.

Validation : tests des classes réelles du SDK, reprise client bornée et absence
de répétition des écritures, TypeScript, build, 56 contrôles API et navigateur
réussis. Vérification de recherche nominative sur les deux adresses, huit
lectures successives par adresse. Aucun profil réel modifié ou supprimé.

## Stockage privé — 11 octobre 2026

Le test approfondi a reproduit les 503 : les lectures du Blob public recevaient
une page HTML « Vercel Security Checkpoint » avec statut 403. L'incident survient
avec et sans Authorization ; ce n'est donc pas un simple conflit de clé.
Le retrait de l'en-tête a amélioré un lot de lectures mais n'a pas résolu la panne.

Un store privé paluca-private-state a été créé et connecté avec sa propre variable
PALUCA_PRIVATE_READ_WRITE_TOKEN. L'état courant a été copié chiffré, après
vérification de l'ETag de la source, puis relu avant toute réponse applicative.
Le profil réel, son diagnostic et le rendez-vous ont été conservés. Le store
public reste utilisé pour les bannières et conserve la copie antérieure chiffrée.
Les lectures et écritures de l'état utilisent désormais le store privé, des
révisions immuables et des écritures conditionnelles par ETag. La migration
automatique a ensuite été retirée : une absence de l'état privé échoue
explicitement et ne réimporte jamais la copie ancienne ni le fichier initial.

Validation en production : 100/100 lectures réussies sous concurrence,
quatre actualisations RDV et 24 lectures concurrentes réussies sur chacune des
deux adresses, aucune alerte de stockage. Profil conservé : 1 ; file de
fiabilisation : 0 ; diagnostic détaillé et quatre dimensions présents au
back-office. Aucun dossier réel fiabilisé, supprimé ou modifié pour le test.
Tests locaux : persistance après redémarrage, lectures privées authentifiées,
absence de cache sur les lectures privées, erreurs transitoires et chiffrement
invalide, TypeScript et build réussis.


