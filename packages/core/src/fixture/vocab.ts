// Fixture vocabulary (plans/TECHNICAL-DESIGN.md §8.2): FR/EN filler word lists plus 40 topic
// domains with their own term bundles. 40 domains × 10 modifiers = 400 topics, so c-TF-IDF and
// FTS see real per-topic term statistics instead of uniform noise. Accented French words are
// deliberate: `unicode61 remove_diacritics 2` is only exercised if the corpus has diacritics.

export const FR_WORDS: readonly string[] = [
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'au', 'aux', 'et',
  'ou', 'mais', 'donc', 'pour', 'avec', 'sans', 'sous', 'sur', 'dans', 'chez',
  'vers', 'entre', 'apres', 'avant', 'pendant', 'depuis', 'contre', 'selon', 'malgre', 'parmi',
  'résumé', 'café', 'éducation', 'électronique', 'données', 'réseau', 'énergie', 'générique',
  'créativité', 'société', 'numérique', 'écologie', 'économie', 'théorie', 'méthode', 'système',
  'modèle', 'problème', 'élève', 'université', 'bibliothèque', 'référence', 'expérience',
  'précision', 'stratégie', 'intérêt', 'qualité', 'quantité', 'réalité', 'mémoire',
  'être', 'avoir', 'faire', 'dire', 'voir', 'savoir', 'pouvoir', 'vouloir', 'devoir', 'prendre',
  'venir', 'partir', 'sortir', 'ouvrir', 'écrire', 'lire', 'mettre', 'tenir', 'suivre', 'vivre',
  'recherche', 'développement', 'apprentissage', 'intelligence', 'artificielle', 'analyse',
  'synthèse', 'structure', 'fonction', 'variable', 'constante', 'processus', 'resultat',
  'exemple', 'exercice', 'chapitre', 'article', 'ouvrage', 'auteur', 'lecteur',
  'travail', 'projet', 'equipe', 'reunion', 'atelier', 'formation', 'parcours', 'programme',
  'module', 'session', 'seance', 'calendrier', 'agenda', 'planning', 'budget', 'facture',
  'client', 'fournisseur', 'partenaire', 'contrat', 'clause', 'garantie', 'assurance',
  'maison', 'jardin', 'cuisine', 'chambre', 'bureau', 'cave', 'grenier', 'terrasse',
  'ville', 'village', 'quartier', 'rue', 'place', 'avenue', 'boulevard', 'chemin', 'sentier',
  'matin', 'midi', 'soir', 'nuit', 'jour', 'semaine', 'mois', 'annee', 'saison', 'heure',
  'printemps', 'ete', 'automne', 'hiver', 'soleil', 'pluie', 'neige', 'vent', 'nuage', 'orage',
  'grand', 'petit', 'long', 'court', 'large', 'etroit', 'haut', 'bas', 'lourd', 'leger',
  'rapide', 'lent', 'simple', 'complexe', 'facile', 'difficile', 'clair', 'obscur', 'propre',
  'nouveau', 'ancien', 'jeune', 'vieux', 'premier', 'dernier', 'meilleur', 'pire', 'autre',
  'rouge', 'bleu', 'vert', 'jaune', 'noir', 'blanc', 'gris', 'brun', 'rose', 'violet',
  'toujours', 'jamais', 'souvent', 'parfois', 'bientot', 'deja', 'encore', 'enfin', 'aussi',
  'beaucoup', 'assez', 'trop', 'peu', 'moins', 'plus', 'tres', 'bien', 'mal', 'mieux',
  'idée', 'pensée', 'esprit', 'raison', 'logique', 'sens', 'valeur', 'principe', 'règle',
  'liberté', 'égalité', 'justice', 'droit', 'loi', 'norme', 'usage', 'coutume',
  'histoire', 'trace', 'archive', 'document', 'source', 'témoin', 'récit', 'conte',
  'image', 'photo', 'vidéo', 'dessin', 'peinture', 'sculpture', 'gravure', 'affiche', 'motif',
  'musique', 'chanson', 'rythme', 'mélodie', 'harmonie', 'timbre', 'tempo', 'mesure', 'accord',
  'corps', 'santé', 'sommeil', 'repos', 'effort', 'muscle', 'souffle', 'coeur', 'nerf', 'peau',
  'nourriture', 'recette', 'saveur', 'épice', 'légume', 'fruit', 'pain', 'fromage', 'poisson',
  'machine', 'outil', 'moteur', 'circuit', 'capteur', 'écran', 'clavier', 'souris', 'câble',
  'serveur', 'paquet', 'protocole', 'adresse', 'requête', 'réponse', 'cache',
  'nombre', 'chiffre', 'calcul', 'somme', 'produit', 'racine', 'courbe', 'droite', 'angle',
  'matière', 'atome', 'molécule', 'cellule', 'gène', 'espèce', 'milieu', 'planète', 'étoile',
];

export const EN_WORDS: readonly string[] = [
  'the', 'a', 'an', 'of', 'and', 'or', 'but', 'so', 'for', 'with',
  'without', 'under', 'over', 'in', 'at', 'to', 'from', 'between', 'after', 'before',
  'during', 'since', 'against', 'about', 'across', 'among', 'beyond', 'within', 'toward', 'upon',
  'research', 'development', 'learning', 'intelligence', 'artificial', 'analysis', 'synthesis',
  'structure', 'function', 'variable', 'constant', 'process', 'result', 'summary', 'abstract',
  'example', 'exercise', 'chapter', 'article', 'book', 'author', 'reader', 'reference',
  'experience', 'precision', 'strategy', 'interest', 'quality', 'quantity', 'reality', 'memory',
  'be', 'have', 'do', 'say', 'see', 'know', 'can', 'want', 'must', 'take',
  'come', 'leave', 'exit', 'open', 'write', 'read', 'put', 'hold', 'follow', 'live',
  'work', 'project', 'team', 'meeting', 'workshop', 'training', 'path', 'program', 'module',
  'session', 'schedule', 'agenda', 'plan', 'budget', 'invoice', 'client', 'vendor', 'partner',
  'contract', 'clause', 'warranty', 'insurance', 'policy', 'licence', 'permit', 'record',
  'house', 'garden', 'kitchen', 'room', 'office', 'studio', 'basement', 'attic', 'terrace',
  'city', 'village', 'district', 'street', 'square', 'avenue', 'boulevard', 'road', 'trail',
  'morning', 'noon', 'evening', 'night', 'day', 'week', 'month', 'year', 'season', 'hour',
  'spring', 'summer', 'autumn', 'winter', 'sun', 'rain', 'snow', 'wind', 'cloud', 'storm',
  'big', 'small', 'long', 'short', 'wide', 'narrow', 'high', 'low', 'heavy', 'light',
  'fast', 'slow', 'simple', 'complex', 'easy', 'hard', 'clear', 'dark', 'clean', 'dirty',
  'new', 'old', 'young', 'ancient', 'first', 'last', 'better', 'worse', 'other', 'same',
  'red', 'blue', 'green', 'yellow', 'black', 'white', 'grey', 'brown', 'pink', 'purple',
  'always', 'never', 'often', 'sometimes', 'soon', 'already', 'again', 'finally', 'also',
  'many', 'enough', 'too', 'few', 'less', 'more', 'very', 'well', 'badly', 'best',
  'idea', 'thought', 'mind', 'reason', 'logic', 'sense', 'value', 'principle', 'rule',
  'freedom', 'equality', 'justice', 'duty', 'right', 'law', 'norm', 'usage', 'custom',
  'history', 'trace', 'archive', 'document', 'source', 'witness', 'story', 'tale', 'legend',
  'image', 'photo', 'video', 'drawing', 'painting', 'sculpture', 'print', 'poster', 'pattern',
  'music', 'song', 'rhythm', 'melody', 'harmony', 'timbre', 'tempo', 'measure', 'chord',
  'body', 'health', 'sleep', 'rest', 'effort', 'muscle', 'breath', 'heart', 'nerve', 'skin',
  'food', 'recipe', 'flavour', 'spice', 'vegetable', 'fruit', 'bread', 'cheese', 'fish',
  'machine', 'tool', 'engine', 'circuit', 'sensor', 'screen', 'keyboard', 'mouse', 'cable',
  'server', 'packet', 'protocol', 'address', 'request', 'response', 'cache', 'queue', 'stack',
  'number', 'digit', 'calculation', 'sum', 'product', 'root', 'curve', 'line', 'angle',
  'matter', 'atom', 'molecule', 'cell', 'gene', 'species', 'environment', 'planet', 'star',
];

export interface TopicDomain {
  key: string;
  /** Ten French terms that carry this domain's signal. */
  fr: readonly string[];
  /** Ten English terms that carry this domain's signal. */
  en: readonly string[];
}

/** 40 domains. Terms are domain-discriminative, never filler. */
export const TOPIC_DOMAINS: readonly TopicDomain[] = [
  { key: 'ia',
    fr: ['transformeur', 'plongement', 'inférence', 'entraînement', 'perceptron', 'gradient', 'tokenisation', 'hallucination', 'alignement', 'surapprentissage'],
    en: ['transformer', 'embedding', 'inference', 'finetuning', 'perceptron', 'backprop', 'tokenizer', 'hallucinations', 'alignment', 'overfitting'] },
  { key: 'web',
    fr: ['navigateur', 'hypertexte', 'feuillestyle', 'composant', 'hydratation', 'accessibilite', 'balisage', 'rendu', 'empaquetage', 'polyfill'],
    en: ['browser', 'hypertext', 'stylesheet', 'component', 'hydration', 'accessibility', 'markup', 'rendering', 'bundling', 'polyfills'] },
  { key: 'design',
    fr: ['typographie', 'chromie', 'maquette', 'gabarit', 'interligne', 'graisse', 'contraste', 'grille', 'vignette', 'esquisse'],
    en: ['typography', 'palette', 'mockup', 'template', 'leading', 'weight', 'contrast', 'grid', 'thumbnail', 'sketch'] },
  { key: 'musique',
    fr: ['synthetiseur', 'sequenceur', 'reverberation', 'polyphonie', 'modulation', 'arpege', 'contrepoint', 'echantillonnage', 'mixage', 'masterisation'],
    en: ['synthesizer', 'sequencer', 'reverb', 'polyphony', 'modulations', 'arpeggio', 'counterpoint', 'sampler', 'mixdown', 'mastering'] },
  { key: 'cinema',
    fr: ['montage', 'cadrage', 'plansequence', 'scenario', 'realisateur', 'figurant', 'travelling', 'etalonnage', 'doublage', 'generiquefilm'],
    en: ['editing', 'framing', 'longtake', 'screenplay', 'director', 'extras', 'dolly', 'grading', 'dubbing', 'credits'] },
  { key: 'photo',
    fr: ['ouverture', 'obturateur', 'profondeur', 'bokeh', 'posemetre', 'argentique', 'chambrenoire', 'tirage', 'objectif', 'focale'],
    en: ['aperture', 'shutter', 'depthoffield', 'bokehs', 'lightmeter', 'filmstock', 'darkroom', 'prints', 'lens', 'focal'] },
  { key: 'cuisine',
    fr: ['levain', 'braisage', 'emulsion', 'marinade', 'fermentation', 'mijotage', 'assaisonnement', 'julienne', 'roux', 'deglacage'],
    en: ['sourdough', 'braising', 'emulsions', 'marinades', 'fermenting', 'simmering', 'seasoning', 'juliennes', 'rouxsauce', 'deglazing'] },
  { key: 'jardin',
    fr: ['permaculture', 'compost', 'paillage', 'bouturage', 'semis', 'greffe', 'taille', 'rotationculture', 'humus', 'vivace'],
    en: ['permaculturegarden', 'composting', 'mulching', 'cuttings', 'seedling', 'grafting', 'pruning', 'croprotation', 'humussoil', 'perennial'] },
  { key: 'voyage',
    fr: ['itineraire', 'auberge', 'randonnee', 'passeport', 'escale', 'bivouac', 'refuge', 'traversee', 'depaysement', 'boussole'],
    en: ['itinerary', 'hostel', 'hiking', 'passport', 'layover', 'bivouacs', 'shelter', 'crossing', 'wanderlust', 'compass'] },
  { key: 'sport',
    fr: ['endurance', 'fractionne', 'echauffement', 'recuperation', 'cadence', 'foulee', 'peloton', 'dossard', 'chronometre', 'entraineur'],
    en: ['enduranceruns', 'intervals', 'warmup', 'recovery', 'cadences', 'stride', 'pelotons', 'racebib', 'stopwatch', 'coach'] },
  { key: 'sante',
    fr: ['diagnostic', 'posologie', 'symptome', 'vaccin', 'immunite', 'prevention', 'ordonnance', 'consultation', 'pathologie', 'guerison'],
    en: ['diagnosis', 'dosage', 'symptom', 'vaccine', 'immunity', 'preventive', 'prescription', 'consultations', 'pathology', 'healing'] },
  { key: 'finance',
    fr: ['obligation', 'dividende', 'volatilite', 'portefeuille', 'liquidite', 'amortissement', 'tresorerie', 'rendement', 'couverture', 'arbitrage'],
    en: ['bonds', 'dividend', 'volatility', 'portfolio', 'liquidity', 'amortization', 'treasury', 'yield', 'hedging', 'arbitrages'] },
  { key: 'droit',
    fr: ['jurisprudence', 'contentieux', 'plaidoirie', 'requerant', 'ordonnancejur', 'prescriptionjur', 'tribunal', 'appel', 'cassation', 'statutjur'],
    en: ['caselaw', 'litigation', 'pleading', 'claimant', 'ordinance', 'limitations', 'court', 'appeals', 'cassationcourt', 'statute'] },
  { key: 'politique',
    fr: ['scrutin', 'circonscription', 'referendum', 'coalition', 'amendement', 'legislature', 'souverainete', 'abstention', 'motion', 'suffrage'],
    en: ['ballot', 'constituency', 'referenda', 'coalitions', 'amendment', 'legislatures', 'sovereignty', 'abstentions', 'motions', 'suffrages'] },
  { key: 'histoire',
    fr: ['antiquite', 'medieval', 'renaissance', 'revolution', 'colonisation', 'chronologie', 'vestige', 'manuscrithist', 'dynastie', 'traitehist'],
    en: ['antiquity', 'medievalera', 'renaissanceera', 'revolutions', 'colonisations', 'chronology', 'relic', 'manuscripts', 'dynasty', 'treaty'] },
  { key: 'science',
    fr: ['hypothese', 'protocole', 'reproductibilite', 'echantillon', 'correlation', 'publication', 'relecture', 'instrument', 'mesurescience', 'incertitude'],
    en: ['hypotheses', 'protocols', 'reproducibility', 'samples', 'correlations', 'publications', 'peerreview', 'instruments', 'measurement', 'uncertainty'] },
  { key: 'espace',
    fr: ['orbite', 'exoplanete', 'telescope', 'nebuleuse', 'propulsion', 'apesanteur', 'lanceur', 'sonde', 'astronaute', 'galaxie'],
    en: ['orbit', 'exoplanet', 'telescopes', 'nebula', 'propulsions', 'weightlessness', 'launcher', 'probe', 'astronaut', 'galaxy'] },
  { key: 'climat',
    fr: ['rechauffement', 'carbone', 'banquise', 'secheresse', 'canicule', 'adaptation', 'emission', 'puitscarbone', 'modelisation', 'biodiversite'],
    en: ['warming', 'carbonbudget', 'seaice', 'drought', 'heatwave', 'adaptations', 'emissions', 'carbonsink', 'modelling', 'biodiversity'] },
  { key: 'energie',
    fr: ['photovoltaique', 'eolien', 'hydraulique', 'nucleaire', 'stockage', 'rendementener', 'reseauelectrique', 'isolationther', 'geothermie', 'hydrogene'],
    en: ['photovoltaic', 'windpower', 'hydropower', 'nuclearplant', 'storage', 'efficiency', 'powergrid', 'insulation', 'geothermal', 'hydrogen'] },
  { key: 'biologie',
    fr: ['mitochondrie', 'ribosome', 'enzyme', 'proteine', 'mutation', 'phylogenie', 'symbiose', 'metabolisme', 'microbiote', 'evolution'],
    en: ['mitochondria', 'ribosomes', 'enzymes', 'protein', 'mutations', 'phylogeny', 'symbiosis', 'metabolism', 'microbiome', 'evolutionary'] },
  { key: 'chimie',
    fr: ['catalyseur', 'solvant', 'titrage', 'oxydoreduction', 'isomere', 'chromatographie', 'polymere', 'valence', 'stoechiometrie', 'cristallisation'],
    en: ['catalyst', 'solvent', 'titration', 'redox', 'isomer', 'chromatography', 'polymer', 'valences', 'stoichiometry', 'crystallisation'] },
  { key: 'physique',
    fr: ['quantique', 'relativite', 'entropie', 'photon', 'supraconducteur', 'interference', 'thermodynamique', 'particule', 'champ', 'oscillateur'],
    en: ['quantumfield', 'relativity', 'entropy', 'photons', 'superconductor', 'interference', 'thermodynamics', 'particle', 'fields', 'oscillator'] },
  { key: 'maths',
    fr: ['topologie', 'integrale', 'matrice', 'conjecture', 'demonstration', 'bijection', 'polynome', 'convexite', 'martingale', 'homomorphisme'],
    en: ['topology', 'integral', 'matrices', 'conjectures', 'proofs', 'bijections', 'polynomial', 'convexity', 'martingales', 'homomorphism'] },
  { key: 'education',
    fr: ['pedagogie', 'didactique', 'evaluation', 'remediation', 'curriculum', 'competence', 'differenciation', 'tutorat', 'autonomie', 'motivation'],
    en: ['pedagogy', 'didactics', 'assessment', 'remediations', 'curricula', 'competency', 'differentiation', 'tutoring', 'autonomy', 'motivations'] },
  { key: 'langue',
    fr: ['morphologie', 'syntaxe', 'phonetique', 'lexique', 'conjugaison', 'etymologie', 'dialecte', 'traduction', 'idiome', 'prosodie'],
    en: ['morphology', 'syntaxtree', 'phonetics', 'lexicon', 'conjugation', 'etymology', 'dialects', 'translations', 'idioms', 'prosody'] },
  { key: 'litterature',
    fr: ['roman', 'nouvellelitt', 'poesie', 'narrateur', 'intrigue', 'metaphore', 'alexandrin', 'manuscritlitt', 'pastiche', 'incipit'],
    en: ['novel', 'shortstory', 'poetry', 'narrator', 'plotline', 'metaphors', 'alexandrine', 'manuscriptlit', 'pastiches', 'incipits'] },
  { key: 'philosophie',
    fr: ['ontologie', 'epistemologie', 'dialectique', 'phenomenologie', 'ethique', 'metaphysique', 'sophisme', 'stoicisme', 'nominalisme', 'aporie'],
    en: ['ontology', 'epistemology', 'dialectics', 'phenomenology', 'ethicsphil', 'metaphysics', 'fallacy', 'stoicism', 'nominalism', 'aporias'] },
  { key: 'psychologie',
    fr: ['cognition', 'attachement', 'biaiscognitif', 'therapie', 'perception', 'inconscient', 'resilience', 'conditionnement', 'empathie', 'anxiete'],
    en: ['cognitions', 'attachments', 'biases', 'therapies', 'perceptions', 'unconscious', 'resiliency', 'conditioning', 'empathy', 'anxieties'] },
  { key: 'sociologie',
    fr: ['habitus', 'stratification', 'sociabilite', 'anomie', 'ethnographie', 'institution', 'mobilite', 'reproductionsoc', 'legitimite', 'capitalsocial'],
    en: ['habituses', 'stratifications', 'sociability', 'anomies', 'ethnography', 'institutions', 'mobility', 'reproduction', 'legitimacy', 'socialcapital'] },
  { key: 'architecture',
    fr: ['ossature', 'facade', 'plancher', 'charpente', 'volumetrie', 'urbanisme', 'isolationbat', 'maitriseoeuvre', 'permisconstruire', 'materiaux'],
    en: ['framing', 'facades', 'floorplate', 'trusswork', 'massing', 'urbanism', 'envelope', 'stewardship', 'buildingpermit', 'materials'] },
  { key: 'mode',
    fr: ['patronage', 'couture', 'drape', 'tissage', 'silhouette', 'defile', 'surpiqure', 'doublure', 'teinture', 'maille'],
    en: ['patterncut', 'tailoring', 'drapes', 'weaving', 'silhouettes', 'runway', 'topstitch', 'lining', 'dyeing', 'knitwear'] },
  { key: 'jeux',
    fr: ['gameplay', 'niveaudesign', 'rejouabilite', 'moteurjeu', 'hitbox', 'speedrun', 'procedural', 'roguelike', 'equilibrage', 'narrationjeu'],
    en: ['gameplayloop', 'leveldesign', 'replayability', 'gameengine', 'hitboxes', 'speedruns', 'proceduralgen', 'roguelikes', 'balancing', 'storytelling'] },
  { key: 'hardware',
    fr: ['microcontroleur', 'soudure', 'oscilloscope', 'condensateur', 'resistanceelec', 'micrologiciel', 'brochage', 'alimentation', 'dissipateur', 'serigraphie'],
    en: ['microcontroller', 'soldering', 'oscilloscopes', 'capacitor', 'resistor', 'firmware', 'pinout', 'powersupply', 'heatsink', 'silkscreen'] },
  { key: 'securite',
    fr: ['chiffrement', 'authentification', 'vulnerabilite', 'hameconnage', 'bacasable', 'signature', 'certificat', 'exfiltration', 'durcissement', 'auditsec'],
    en: ['encryption', 'authentication', 'vulnerability', 'phishing', 'sandbox', 'signatures', 'certificate', 'exfiltrations', 'hardening', 'audits'] },
  { key: 'reseau',
    fr: ['routage', 'latence', 'bandepassante', 'parefeu', 'tunnelisation', 'multidiffusion', 'poignee', 'congestion', 'appairage', 'resolutiondns'],
    en: ['routing', 'latencies', 'bandwidth', 'firewall', 'tunnelling', 'multicast', 'handshake', 'congestions', 'peering', 'resolver'] },
  { key: 'data',
    fr: ['entrepot', 'pipelinedata', 'normalisation', 'jointure', 'partitionnement', 'indexation', 'agregation', 'schemadata', 'lignage', 'requetage'],
    en: ['warehouse', 'datapipeline', 'normalisations', 'joins', 'partitioning', 'indexing', 'aggregation', 'schemas', 'lineage', 'querying'] },
  { key: 'mobile',
    fr: ['tactile', 'notification', 'horsligne', 'permission', 'batterie', 'capteurmobile', 'lienprofond', 'boutique', 'responsivite', 'geste'],
    en: ['touchinput', 'notifications', 'offline', 'permissions', 'battery', 'mobilesensor', 'deeplink', 'appstore', 'responsiveness', 'gestures'] },
  { key: 'ecommerce',
    fr: ['panier', 'tunnelachat', 'stock', 'expedition', 'remboursement', 'fidelite', 'catalogue', 'referencearticle', 'promotion', 'conversion'],
    en: ['cart', 'checkout', 'inventory', 'shipping', 'refunds', 'loyalty', 'catalogues', 'skucode', 'promotions', 'conversions'] },
  { key: 'marketing',
    fr: ['segmentation', 'positionnement', 'notoriete', 'audience', 'engagement', 'entonnoir', 'attribution', 'retention', 'persona', 'campagne'],
    en: ['segmentations', 'positioning', 'awareness', 'audiences', 'engagements', 'funnel', 'attributions', 'retentions', 'personas', 'campaigns'] },
  { key: 'media',
    fr: ['redaction', 'editorial', 'verification', 'sourcejournal', 'diffusion', 'audimat', 'baladodiffusion', 'infographie', 'chronique', 'deontologie'],
    en: ['newsroom', 'editorials', 'factcheck', 'newssource', 'broadcast', 'ratings', 'podcast', 'infographic', 'columns', 'ethicscode'] },
];

export interface TopicModifier {
  fr: string;
  en: string;
}

/** Ten angles. domain × modifier = 400 topics, each with a distinguishable term bundle. */
export const TOPIC_MODIFIERS: readonly TopicModifier[] = [
  { fr: 'introduction', en: 'introduction' },
  { fr: 'pratique', en: 'practice' },
  { fr: 'critique', en: 'critique' },
  { fr: 'histoirethem', en: 'backstory' },
  { fr: 'outils', en: 'toolkit' },
  { fr: 'debat', en: 'debate' },
  { fr: 'etudecas', en: 'casestudy' },
  { fr: 'tutoriel', en: 'tutorial' },
  { fr: 'veille', en: 'watchlist' },
  { fr: 'archivethem', en: 'archived' },
];

export const TOPIC_COUNT: number = TOPIC_DOMAINS.length * TOPIC_MODIFIERS.length;

export interface Topic {
  index: number;
  domain: number;
  modifier: number;
  labelFr: string;
  labelEn: string;
  /** Ten FR terms rotated per modifier, plus the modifier term: sibling topics share a domain
   *  vocabulary but not its ordering, which is what a Markov chain turns into distinct text. */
  termsFr: readonly string[];
  termsEn: readonly string[];
}

function rotate(xs: readonly string[], by: number): string[] {
  const n = xs.length;
  const k = ((by % n) + n) % n;
  return [...xs.slice(k), ...xs.slice(0, k)];
}

/** The 400 topics. Deterministic and RNG-free. */
export function buildTopics(): Topic[] {
  const out: Topic[] = [];
  for (let d = 0; d < TOPIC_DOMAINS.length; d++) {
    const dom = TOPIC_DOMAINS[d]!;
    for (let m = 0; m < TOPIC_MODIFIERS.length; m++) {
      const mod = TOPIC_MODIFIERS[m]!;
      out.push({
        index: d * TOPIC_MODIFIERS.length + m,
        domain: d,
        modifier: m,
        labelFr: `${dom.key} ${mod.fr}`,
        labelEn: `${dom.key} ${mod.en}`,
        termsFr: [...rotate(dom.fr, m), mod.fr],
        termsEn: [...rotate(dom.en, m), mod.en],
      });
    }
  }
  return out;
}
