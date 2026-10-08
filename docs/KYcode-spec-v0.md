# KYcode — Spécification du format v0

Statut : **brouillon v0** — octobre 2026
Implémentation de référence de la géométrie : [`src/core/geometry.ts`](../src/core/geometry.ts), vérifiée par [`tests/geometry.test.ts`](../tests/geometry.test.ts).

Les mots **DOIT**, **NE DOIT PAS**, **DEVRAIT** et **PEUT** ont leur sens normatif habituel.

---

## 1. Principe

Un KYcode est un symbole graphique propriétaire en forme de **triangle équilatéral**, lu par le scanner KYcode (et non par les lecteurs QR standards).

Il n'encode pas une URL mais un **identifiant court** de 48 bits. Le service de redirection associe cet identifiant à une destination modifiable.

```
identifiant  →  octets + Reed-Solomon  →  blanchiment  →  placement dans la grille  →  rendu SVG/PNG
scan caméra  →  détection des repères  →  homographie  →  échantillonnage  →  3 rotations × décodage RS  →  identifiant
```

## 2. Vue d'ensemble

| Élément | Valeur v0 |
|---|---|
| Forme | Triangle équilatéral, pointe en haut dans l'orientation canonique |
| Grille | 24 rangées de cellules triangulaires, soit **576 cellules** |
| Repères de coin | 3 repères identiques, côté 9 rangées (243 cellules) |
| Séparateurs | Bande claire d'une cellule le long de chaque repère (57 cellules) |
| Repère central | Triangle inversé de côté 6, centré (36 cellules) |
| Données | **240 cellules = 30 octets** |
| Contenu | 1 octet d'en-tête + 6 octets d'identifiant = 7 octets |
| Correction d'erreur | Reed-Solomon GF(256), 23 octets ; corrige jusqu'à **11 octets erronés (≈ 37 %)** |
| Symétrie | Motifs fonctionnels invariants par rotation de 120° |

Carte des zones : [`layout-v0.svg`](layout-v0.svg) — aperçu avec données aléatoires (pas un vrai encodage) : [`apercu-v0.svg`](apercu-v0.svg).

## 3. Grille

### 3.1 Cellules

Le symbole a un côté de N = 24 unités. Il est découpé en N rangées horizontales, numérotées `r = 0` (sommet) à `r = 23` (base).

La rangée `r` contient `2r + 1` cellules, indexées `c = 0 … 2r` de gauche à droite :
- `c` pair : triangle **pointe en haut** (indice `k = c/2`, `k = 0 … r`) ;
- `c` impair : triangle **pointe en bas** (indice `k = (c−1)/2`, `k = 0 … r−1`).

Coordonnées géométriques (côté de cellule = 1, hauteur de rangée `h = √3/2`, sommet du symbole en `(N/2, 0)`) :

| Cellule | Sommets |
|---|---|
| Pointe en haut `(r, k)` | `(N/2 − r/2 + k, r·h)`, `(N/2 − (r+1)/2 + k + 1, (r+1)·h)`, `(N/2 − (r+1)/2 + k, (r+1)·h)` |
| Pointe en bas `(r, k)` | `(N/2 − r/2 + k, r·h)`, `(N/2 − r/2 + k + 1, r·h)`, `(N/2 − r/2 + k + ½, (r+1)·h)` |

### 3.2 Coordonnées barycentriques

Chaque cellule reçoit trois entiers `(a, b, g)`, qui mesurent sa distance en rangées aux trois côtés du symbole :

| | a (côté base) | b (côté gauche) | g (côté droit) | a + b + g |
|---|---|---|---|---|
| Pointe en haut | `N−1−r` | `k` | `r−k` | `N−1 = 23` |
| Pointe en bas | `N−1−r` | `k` | `r−1−k` | `N−2 = 22` |

Le centre de gravité de la cellule a pour coordonnées continues `(a, b, g) + ⅓` (pointe en haut) ou `+ ⅔` (pointe en bas), de somme N.

Les trois coins du symbole sont :
- **coin A**, le sommet (b = g = 0) ;
- **coin G**, en bas à gauche (a = b = 0) ;
- **coin B**, en bas à droite (a = g = 0).

**Rotation de 120°** : `(a, b, g) → (g, a, b)`. Elle envoie chaque cellule sur une cellule de même type et permute les coins A → B → G.

## 4. Zones fonctionnelles

Une cellule appartient à exactement une zone. Les tests sont appliqués dans l'ordre ci-dessous, avec `L = 8` (pointe en haut) ou `L = 7` (pointe en bas).

### 4.1 Repères de coin (finders)

Pour chaque coin, on prend la paire de coordonnées qui y valent 0 : `(b, g)` pour A, `(a, b)` pour G, `(a, g)` pour B.

Une cellule appartient au repère de ce coin si `x + y ≤ L`. Sa profondeur est alors `d = min(x, y, L − x − y)` :

| Profondeur | Couleur | Cellules par repère |
|---|---|---|
| `d = 0` | sombre (anneau extérieur) | 45 |
| `d = 1` | claire (anneau intérieur) | 27 |
| `d ≥ 2` | sombre (noyau, triangle de côté 3) | 9 |

La structure *sombre ⊃ clair ⊃ sombre*, aux proportions fixes, est la signature recherchée par le détecteur.

### 4.2 Séparateurs

Une cellule hors repère telle que `x + y = L + 1`, pour au moins un coin, est **claire**. Il y a 57 cellules de séparateur au total.

### 4.3 Repère central (alignement)

C'est un triangle **inversé** de côté 6, centré exactement sur le centre de gravité du symbole `(8, 8, 8)`. Avec `u = (N + 6)/3 = 10` et `m` la plus grande coordonnée continue du centre de la cellule :
- si `m ≤ u`, la cellule appartient au repère central ;
- elle est **sombre** si `u − m < 1` (anneau, 27 cellules), **claire** sinon (cœur, triangle de côté 3, 9 cellules).

Il fournit le 4e point de référence nécessaire à la correction de perspective.

### 4.4 Données

Les 240 cellules restantes portent les données. Leur **ordre de placement** est l'ordre canonique : rangées de haut en bas, puis `c` croissant dans chaque rangée.

## 5. Contenu

### 5.1 Charge utile (7 octets)

| Octet | Contenu |
|---|---|
| 0 | En-tête : bits 7–4 = **type** (`0x1` = identifiant court) ; bits 3–0 = **réservés**, DOIVENT valoir 0 |
| 1–6 | Identifiant, entier non signé de 48 bits, gros-boutiste (octet de poids fort en premier) |

L'en-tête v0 vaut donc `0x10`. Un décodeur DOIT rejeter un en-tête inconnu.

### 5.2 Identifiant

- Il est compris entre 0 et 62⁸ − 1 (≈ 2,18 × 10¹⁴).
- Sa **forme textuelle** est l'écriture en base 62, sur exactement **8 caractères** complétés par des zéros à gauche, avec l'alphabet `0-9A-Za-z` dans cet ordre. Exemple d’URL : `https://kyskan.com/K7f3Qx2a`.
- Le service DEVRAIT attribuer les identifiants **aléatoirement**, et non séquentiellement, pour empêcher l'énumération des codes.

### 5.3 Correction d'erreur

On utilise Reed-Solomon sur GF(256) avec le polynôme primitif `x⁸ + x⁴ + x³ + x² + 1` (0x11D, celui du QR code) et α = 2. Le polynôme générateur est `∏ (x − αⁱ)` pour `i = 0 … 22`.

Le codage est systématique : **7 octets de données suivis de 23 octets de contrôle**, soit 30 octets.

### 5.4 Flux de bits

Les 30 octets sont lus bit de poids fort en premier, ce qui donne 240 bits `D[0…239]`.

### 5.5 Blanchiment

Chaque bit est combiné par XOR avec une suite pseudo-aléatoire fixe `W[i]`, pour éviter les grands aplats et les faux repères :

```
s = 0xACE1
pour i de 0 à 239 :
    W[i] = s & 1
    t = (s ^ (s >> 2) ^ (s >> 3) ^ (s >> 5)) & 1
    s = (s >> 1) | (t << 15)
```

On place `B[i] = D[i] XOR W[i]`. **1 = cellule sombre.**

### 5.6 Placement

Le bit `B[i]` est placé dans la cellule de données de rang `i` (§4.4).

## 6. Rendu

- **Zone de silence** : une marge claire d'au moins **2 côtés de cellule** DOIT entourer le triangle. Aucun élément décoratif ne DOIT y empiéter.
- **Contraste** : le rapport de luminance entre clair et sombre DEVRAIT être d'au moins 4:1. Le sombre DOIT être plus foncé que le clair.
- **Couleurs, dégradés et contour** (variantes de l'image de référence) : autorisés tant que chaque cellule sombre reste plus foncée que chaque cellule claire. Un contour décoratif DOIT se trouver hors de la zone de silence.
- **Espacement** : une cellule PEUT être réduite vers son centre de gravité, d'au plus **15 %** de sa taille, pour l'effet « points triangulaires ». Les repères DEVRAIENT rester pleins.
- Les cellules sombres adjacentes DEVRAIENT être fusionnées en un seul tracé, pour éviter les liserés d'antialiasing.
- Les repères NE DOIVENT PAS être modifiés dans leur géométrie.
- **Taille minimale recommandée** à l'impression : 25 mm de côté (cellule ≈ 1 mm). Cette valeur sera validée par les tests de l'étape 3.

## 7. Décodage (informatif)

Algorithme de l'implémentation de référence ([`src/decoder/decode.ts`](../src/decoder/decode.ts)) :

1. **Réduction** des grandes images à 1000 px de côté au plus.
2. **Binarisation** adaptative par blocs de 8 px. Le seuil local est la moyenne des 5 × 5 blocs voisins. Un bloc est uniforme si son écart-type est inférieur à 9 : il hérite alors du seuil des blocs contrastés les plus proches et il est classé en entier d'après sa moyenne, pour que le bruit de capteur ne se transforme pas en poussière.
3. **Composantes connexes** : sombres en 8-connexité, claires en 4-connexité, avec leurs voisines.
4. **Détection des repères** : on cherche une composante sombre (le noyau) dont la seule voisine est une composante claire (l'anneau), elle-même bordée d'une composante sombre (l'anneau extérieur), à quelques taches près. Le rapport des aires *anneau clair / noyau* doit être compris entre 1,5 et 7 (idéal : 3).
5. **Sélection d'un triplet** cohérent : rapport de tailles ≤ 2,5, rapport des côtés ≤ 2,2, espacement compatible avec la géométrie. Les 6 meilleurs triplets sont essayés.
6. **Sens de parcours** : les repères sont ordonnés comme A → G → B, ce qui suppose une image non inversée.
7. Pour chacune des **3 rotations** (le symbole est symétrique, l'orientation n'est pas connue d'avance) :
   1. transformation affine depuis les 3 repères, puis recherche du cœur clair du repère central près de la position prédite ;
   2. **homographie** sur 4 points, ou transformation affine si le repère central n'est pas trouvé ;
   3. **lecture** de chaque cellule de données : moyenne des niveaux de gris en 4 points (le centre de gravité et 3 points à 20 % vers les sommets), comparée au seuil local ;
   4. retrait du blanchiment et **décodage Reed-Solomon**. En cas d'échec, les octets dont les lectures sont les plus proches du seuil sont déclarés **effacés**, par paliers de 2 jusqu'à 16 ;
   5. vérification de l'en-tête.
8. Si rien n'est trouvé, second passage sur une copie légèrement lissée (contre le bruit fin).
9. Formatage de l'identifiant en base 62.

**Fiabilité.** Un résultat n'est rendu qu'après une correction Reed-Solomon réussie et un en-tête valide. Le risque de renvoyer un faux identifiant est d'environ 10⁻²¹ sans effacement. Il est plafonné à environ 10⁻⁷ par image dans le pire cas (16 effacements, toutes les tentatives épuisées). C'est la raison du plafond de 16 : la capacité théorique irait jusqu'à 23 effacements.

### 7.1 Limites mesurées (scènes synthétiques, `npm run limits`)

Taux de réussite sur 12 identifiants, avec des angles variés. Sauf mention contraire, les cellules mesurent 10 px de côté.

| Dégradation | Réussite 100 % jusqu'à | Limite |
|---|---|---|
| Taille de cellule | 2,5 px (soit environ 60 px de côté de symbole) | 0 % à 2 px |
| Bruit gaussien | écart-type 60 | — |
| Contraste (écart clair-sombre) | 30 niveaux sur 255 | 25 % à 20 |
| Perspective (raccourcissement du bord haut) | 40 % | 92 % à 50 %, 67 % à 60 % |
| Flou (cellule de 8 px) | rayon 1 | 67 % au rayon 2 (σ ≈ 2,5 px), 0 % au rayon 3 |

**Vitesse** (`npm run bench`, image 960 × 540, Node) : environ 17 ms par image avec un code, 80 ms sans code (les deux passages sont alors tentés).

**Point faible identifié : le flou.** Une cellule triangulaire a un cercle inscrit plus petit qu'un module carré de même côté. Quand l'étalement du flou atteint ce rayon, une cellule isolée perd son contraste. Ces chiffres seront confrontés aux photos réelles à l'étape 3, avant toute optimisation. La piste prévue est de compenser l'influence des cellules voisines, en estimant le flou à partir des repères, dont toutes les cellules sont connues.

## 8. Évolutions prévues (hors v0)

- **Autres tailles** : le décodeur peut déduire N du rapport *taille du repère / taille du symbole*, puisque le repère garde un côté de 9.
- **Lecture en miroir** (code vu à travers une vitre) : essayer aussi les 3 rotations miroir.
- **Autres types de contenu** : grâce au type de l'en-tête.

## 9. Points ouverts

- Validation de la taille minimale et des limites de style (espacement, couleurs, dégradés) par des tests réels sur caméra.
- Recherche d'antériorité et de brevets sur les codes triangulaires, avant tout dépôt de marque ou de design.
- Domaine de redirection : **kyskan.com** (retenu). Option à trancher : noms lisibles de 9 caractères au plus (`kyskan.com/trapinaud`) via un second type de contenu.
