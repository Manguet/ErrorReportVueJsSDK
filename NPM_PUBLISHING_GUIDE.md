# Guide de Publication NPM - error-explorer-vuejs-reporter

## Préparation initiale

### 1. Compte NPM
- Créer un compte sur [npmjs.com](https://www.npmjs.com/)
- Vérifier votre email
- Activer l'authentification à deux facteurs (recommandé)

### 2. Connexion locale
```bash
npm login
# Entrer vos identifiants NPM
```

## Étapes de publication

### 1. Vérification du package
```bash
# Vérifier la configuration du package
npm pack --dry-run

# Voir ce qui sera inclus dans le package
npm publish --dry-run
```

### 2. Build du projet
```bash
# Installer les dépendances
npm install

# Lancer les tests
npm test

# Construire le package
npm run build
```

### 3. Vérification du contenu
Vérifier que le dossier `dist/` contient :
- `index.js` (CommonJS)
- `index.esm.js` (ES Modules)
- `index.umd.js` (UMD pour browser)
- `index.d.ts` (Types TypeScript)

### 4. Publication
```bash
# Première publication
npm publish

# Pour les mises à jour
npm version patch  # ou minor/major
npm publish
```

## Gestion des versions

### Stratégie de versioning (SemVer)
- **patch** (1.0.1) : Bug fixes, pas de breaking changes
- **minor** (1.1.0) : Nouvelles fonctionnalités, backward compatible
- **major** (2.0.0) : Breaking changes

### Commandes
```bash
# Version patch (1.0.0 → 1.0.1)
npm version patch

# Version minor (1.0.0 → 1.1.0)
npm version minor

# Version major (1.0.0 → 2.0.0)
npm version major

# Version personnalisée
npm version 1.2.3
```

## Checklist pré-publication

- [ ] Tests passent (`npm test`)
- [ ] Build réussit (`npm run build`)
- [ ] Documentation à jour
- [ ] Changelog mis à jour
- [ ] Version correcte dans package.json
- [ ] Repository GitHub configuré
- [ ] .npmignore correctement configuré

## Structure de repository recommandée

```
ErrorReportVueJsSDK/
├── README.md
├── package.json
├── .npmignore
├── rollup.config.js
├── tsconfig.json
├── jest.config.js
├── src/
│   ├── index.ts
│   ├── plugin/
│   ├── services/
│   ├── types/
│   └── utils/
├── tests/
├── dist/ (généré par build)
└── docs/ (optionnel)
```

## Commandes utiles

```bash
# Voir la version actuelle
npm view error-explorer-vuejs-reporter version

# Voir toutes les versions publiées
npm view error-explorer-vuejs-reporter versions --json

# Dépublier une version (dans les 72h)
npm unpublish error-explorer-vuejs-reporter@1.0.0

# Voir les statistiques de téléchargement
npm view error-explorer-vuejs-reporter
```

## Bonnes pratiques

### 1. Tests avant publication
```bash
# Script de pré-publication recommandé
npm run test && npm run build && npm publish --dry-run
```

### 2. Changelog
Maintenir un fichier CHANGELOG.md avec :
- Nouvelles fonctionnalités
- Bug fixes
- Breaking changes
- Dépréciations

### 3. GitHub Release
Créer une release GitHub pour chaque version NPM :
```bash
# Tag automatique avec npm version
git push --follow-tags
```

### 4. CI/CD (optionnel)
Configurer GitHub Actions pour :
- Tests automatiques
- Publication automatique sur tag
- Validation du format du code

## Sécurité

### 1. Audit des dépendances
```bash
npm audit
npm audit fix
```

### 2. .npmignore
Vérifier qu'aucun fichier sensible n'est inclus :
- Fichiers de configuration locaux
- Secrets/clés d'API
- Fichiers de test volumineux

### 3. Authentification 2FA
Activer l'authentification à deux facteurs sur NPM pour sécuriser les publications.

## Dépannage

### Erreur "package already exists"
- Le nom est déjà pris
- Choisir un autre nom ou utiliser un scope (@username/package-name)

### Erreur de permissions
- Vérifier que vous êtes connecté (`npm whoami`)
- Vérifier les droits sur le package

### Build échoue
- Vérifier Node.js version (>=14.0.0)
- Nettoyer node_modules et réinstaller
- Vérifier les dépendances dans package.json