// Public-domain hymns (all published before 1928 in the US — copyright expired).
// Full, real lyrics — no placeholders.
export type Hymn = {
  id: string;
  title: string;
  author: string;
  year: number;
  verses: string[];
  chorus?: string;
};

export function searchHymns(query: string): Hymn[] {
  const q = query.trim().toLowerCase();
  if (!q) return hymns;
  return hymns.filter(
    (h) =>
      h.title.toLowerCase().includes(q) ||
      h.author.toLowerCase().includes(q) ||
      h.verses.some((v) => v.toLowerCase().includes(q)) ||
      (h.chorus?.toLowerCase().includes(q) ?? false)
  );
}

export const hymns: Hymn[] = [
  {
    id: "amazing-grace",
    title: "Amazing Grace",
    author: "John Newton",
    year: 1779,
    verses: [
      "Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found,\nWas blind, but now I see.",
      "'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed!",
      "Through many dangers, toils and snares\nI have already come;\n'Tis grace hath brought me safe thus far,\nAnd grace will lead me home.",
      "When we've been there ten thousand years,\nBright shining as the sun,\nWe've no less days to sing God's praise\nThan when we'd first begun.",
    ],
  },
  {
    id: "how-firm-a-foundation",
    title: "How Firm a Foundation",
    author: "John Rippon (attr.)",
    year: 1787,
    verses: [
      "How firm a foundation, ye saints of the Lord,\nIs laid for your faith in His excellent Word!\nWhat more can He say than to you He hath said,\nTo you who for refuge to Jesus have fled?",
      '"Fear not, I am with thee, O be not dismayed,\nFor I am thy God and will still give thee aid;\nI\'ll strengthen thee, help thee, and cause thee to stand,\nUpheld by My righteous, omnipotent hand.',
      '"When through the deep waters I call thee to go,\nThe rivers of woe shall not thee overflow;\nFor I will be with thee, thy troubles to bless,\nAnd sanctify to thee thy deepest distress.',
      '"When through fiery trials thy pathway shall lie,\nMy grace, all sufficient, shall be thy supply;\nThe flame shall not hurt thee; I only design\nThy dross to consume and thy gold to refine.',
    ],
  },
  {
    id: "blessed-assurance",
    title: "Blessed Assurance",
    author: "Fanny Crosby",
    year: 1873,
    verses: [
      "Blessed assurance, Jesus is mine!\nO what a foretaste of glory divine!\nHeir of salvation, purchase of God,\nBorn of His Spirit, washed in His blood.",
      "Perfect submission, perfect delight,\nVisions of rapture now burst on my sight;\nAngels descending bring from above\nEchoes of mercy, whispers of love.",
      "Perfect submission, all is at rest,\nI in my Savior am happy and blest,\nWatching and waiting, looking above,\nFilled with His goodness, lost in His love.",
    ],
    chorus:
      "This is my story, this is my song,\nPraising my Savior all the day long;\nThis is my story, this is my song,\nPraising my Savior all the day long.",
  },
  {
    id: "it-is-well",
    title: "It Is Well with My Soul",
    author: "Horatio Spafford",
    year: 1873,
    verses: [
      "When peace like a river attendeth my way,\nWhen sorrows like sea billows roll;\nWhatever my lot, Thou hast taught me to say,\nIt is well, it is well with my soul.",
      "Though Satan should buffet, though trials should come,\nLet this blest assurance control,\nThat Christ has regarded my helpless estate,\nAnd hath shed His own blood for my soul.",
      "My sin, oh the bliss of this glorious thought!\nMy sin, not in part but the whole,\nIs nailed to the cross, and I bear it no more,\nPraise the Lord, praise the Lord, O my soul!",
      "And Lord, haste the day when my faith shall be sight,\nThe clouds be rolled back as a scroll;\nThe trump shall resound and the Lord shall descend,\nEven so, it is well with my soul.",
    ],
    chorus: "It is well (it is well)\nWith my soul (with my soul)\nIt is well, it is well with my soul.",
  },
  {
    id: "holy-holy-holy",
    title: "Holy, Holy, Holy",
    author: "Reginald Heber",
    year: 1826,
    verses: [
      "Holy, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to Thee;\nHoly, holy, holy! Merciful and mighty,\nGod in three Persons, blessèd Trinity!",
      "Holy, holy, holy! All the saints adore Thee,\nCasting down their golden crowns around the glassy sea;\nCherubim and seraphim falling down before Thee,\nWhich wert, and art, and evermore shalt be.",
      "Holy, holy, holy! Though the darkness hide Thee,\nThough the eye of sinful man Thy glory may not see,\nOnly Thou art holy; there is none beside Thee,\nPerfect in power, in love, and purity.",
      "Holy, holy, holy! Lord God Almighty!\nAll Thy works shall praise Thy name, in earth and sky and sea;\nHoly, holy, holy! Merciful and mighty,\nGod in three Persons, blessèd Trinity!",
    ],
  },
  {
    id: "rock-of-ages",
    title: "Rock of Ages",
    author: "Augustus Toplady",
    year: 1775,
    verses: [
      "Rock of Ages, cleft for me,\nLet me hide myself in Thee;\nLet the water and the blood,\nFrom Thy wounded side which flowed,\nBe of sin the double cure,\nSave from wrath and make me pure.",
      "Not the labor of my hands\nCan fulfill Thy law's demands;\nCould my zeal no respite know,\nCould my tears forever flow,\nAll for sin could not atone;\nThou must save, and Thou alone.",
      "Nothing in my hand I bring,\nSimply to the cross I cling;\nNaked, come to Thee for dress;\nHelpless, look to Thee for grace;\nFoul, I to the fountain fly;\nWash me, Savior, or I die.",
      "While I draw this fleeting breath,\nWhen mine eyes shall close in death,\nWhen I soar to worlds unknown,\nSee Thee on Thy judgment throne,\nRock of Ages, cleft for me,\nLet me hide myself in Thee.",
    ],
  },
  {
    id: "a-mighty-fortress",
    title: "A Mighty Fortress Is Our God",
    author: "Martin Luther",
    year: 1529,
    verses: [
      "A mighty fortress is our God,\nA bulwark never failing;\nOur helper He, amid the flood\nOf mortal ills prevailing.\nFor still our ancient foe\nDoth seek to work us woe—\nHis craft and power are great,\nAnd armed with cruel hate,\nOn earth is not his equal.",
      "Did we in our own strength confide,\nOur striving would be losing;\nWere not the right Man on our side,\nThe Man of God's own choosing.\nDost ask who that may be?\nChrist Jesus, it is He—\nLord Sabaoth His name,\nFrom age to age the same,\nAnd He must win the battle.",
      "And though this world, with devils filled,\nShould threaten to undo us,\nWe will not fear, for God hath willed\nHis truth to triumph through us.\nThe prince of darkness grim,\nWe tremble not for him;\nHis rage we can endure,\nFor lo! his doom is sure—\nOne little word shall fell him.",
      "That word above all earthly powers,\nNo thanks to them, abideth;\nThe Spirit and the gifts are ours\nThrough Him who with us sideth.\nLet goods and kindred go,\nThis mortal life also;\nThe body they may kill;\nGod's truth abideth still,\nHis kingdom is forever.",
    ],
  },
  {
    id: "abide-with-me",
    title: "Abide with Me",
    author: "Henry F. Lyte",
    year: 1847,
    verses: [
      "Abide with me; fast falls the eventide;\nThe darkness deepens; Lord, with me abide!\nWhen other helpers fail and comforts flee,\nHelp of the helpless, O abide with me.",
      "Swift to its close ebbs out life's little day;\nEarth's joys grow dim, its glories pass away;\nChange and decay in all around I see;\nO Thou who changest not, abide with me.",
      "I need Thy presence every passing hour;\nWhat but Thy grace can foil the tempter's power?\nWho like Thyself my guide and stay can be?\nThrough cloud and sunshine, Lord, abide with me.",
      "Hold Thou Thy cross before my closing eyes;\nShine through the gloom and point me to the skies;\nHeaven's morning breaks, and earth's vain shadows flee;\nIn life, in death, O Lord, abide with me.",
    ],
  },
  {
    id: "what-a-friend",
    title: "What a Friend We Have in Jesus",
    author: "Joseph M. Scriven",
    year: 1855,
    verses: [
      "What a friend we have in Jesus,\nAll our sins and griefs to bear!\nWhat a privilege to carry\nEverything to God in prayer!\nO what peace we often forfeit,\nO what needless pain we bear,\nAll because we do not carry\nEverything to God in prayer!",
      "Have we trials and temptations?\nIs there trouble anywhere?\nWe should never be discouraged,\nTake it to the Lord in prayer.\nCan we find a friend so faithful\nWho will all our sorrows share?\nJesus knows our every weakness,\nTake it to the Lord in prayer.",
      "Are we weak and heavy-laden,\nCumbered with a load of care?\nPrecious Savior, still our refuge—\nTake it to the Lord in prayer.\nDo thy friends despise, forsake thee?\nTake it to the Lord in prayer;\nIn His arms He'll take and shield thee,\nThou wilt find a solace there.",
    ],
  },
  {
    id: "crown-him",
    title: "Crown Him with Many Crowns",
    author: "Matthew Bridges & Godfrey Thring",
    year: 1851,
    verses: [
      "Crown Him with many crowns,\nThe Lamb upon His throne;\nHark! how the heavenly anthem drowns\nAll music but its own!\nAwake, my soul, and sing\nOf Him who died for thee,\nAnd hail Him as thy matchless King\nThrough all eternity.",
      "Crown Him the Lord of life,\nWho triumphed o'er the grave,\nAnd rose victorious in the strife\nFor those He came to save;\nHis glories now we sing\nWho died and rose on high,\nWho died eternal life to bring\nAnd lives that death may die.",
      "Crown Him the Lord of love;\nBehold His hands and side,\nRich wounds yet visible above\nIn beauty glorified;\nNo angel in the sky\nCan fully bear that sight,\nBut downward bends his burning eye\nAt mysteries so bright.",
      "Crown Him the Lord of heaven,\nOne with the Father known,\nOne with the Spirit through Him given\nFrom yonder glorious throne;\nTo Thee be endless praise,\nFor Thou for us hast died;\nBe Thou, O Lord, through endless days\nAdored and magnified.",
    ],
  },
  {
    id: "come-thou-fount",
    title: "Come Thou Fount of Every Blessing",
    author: "Robert Robinson",
    year: 1758,
    verses: [
      "Come, Thou Fount of every blessing,\nTune my heart to sing Thy grace;\nStreams of mercy, never ceasing,\nCall for songs of loudest praise.\nTeach me some melodious sonnet,\nSung by flaming tongues above;\nPraise the mount! I'm fixed upon it,\nMount of Thy redeeming love.",
      "Here I raise my Ebenezer;\nHither by Thy help I'm come;\nAnd I hope, by Thy good pleasure,\nSafely to arrive at home.\nJesus sought me when a stranger,\nWandering from the fold of God;\nHe, to rescue me from danger,\nInterposed His precious blood.",
      "O to grace how great a debtor\nDaily I'm constrained to be!\nLet Thy goodness, like a fetter,\nBind my wandering heart to Thee.\nProne to wander, Lord, I feel it,\nProne to leave the God I love;\nHere's my heart, O take and seal it,\nSeal it for Thy courts above.",
    ],
  },
  {
    id: "nearer-my-god",
    title: "Nearer, My God, to Thee",
    author: "Sarah F. Adams",
    year: 1841,
    verses: [
      "Nearer, my God, to Thee, nearer to Thee!\nE'en though it be a cross that raiseth me;\nStill all my song shall be, nearer, my God, to Thee,\nNearer, my God, to Thee, nearer to Thee!",
      "Though like the wanderer, the sun gone down,\nDarkness be over me, my rest a stone;\nYet in my dreams I'd be nearer, my God, to Thee,\nNearer, my God, to Thee, nearer to Thee!",
      "There let the way appear, steps unto heaven;\nAll that Thou sendest me, in mercy given;\nAngels to beckon me nearer, my God, to Thee,\nNearer, my God, to Thee, nearer to Thee!",
      "Then with my waking thoughts bright with Thy praise,\nOut of my stony griefs Bethel I'll raise;\nSo by my woes to be nearer, my God, to Thee,\nNearer, my God, to Thee, nearer to Thee!",
    ],
  },
  {
    id: "old-rugged-cross",
    title: "The Old Rugged Cross",
    author: "George Bennard",
    year: 1912,
    verses: [
      "On a hill far away stood an old rugged cross,\nThe emblem of suffering and shame;\nAnd I love that old cross where the dearest and best\nFor a world of lost sinners was slain.",
      "Oh, that old rugged cross, so despised by the world,\nHas a wondrous attraction for me;\nFor the dear Lamb of God left His glory above\nTo bear it to dark Calvary.",
      "In the old rugged cross, stained with blood so divine,\nA wondrous beauty I see;\nFor 'twas on that old cross Jesus suffered and died\nTo pardon and sanctify me.",
      "To the old rugged cross I will ever be true,\nIts shame and reproach gladly bear;\nThen He'll call me someday to my home far away,\nWhere His glory forever I'll share.",
    ],
    chorus:
      "So I'll cherish the old rugged cross,\nTill my trophies at last I lay down;\nI will cling to the old rugged cross,\nAnd exchange it someday for a crown.",
  },
  {
    id: "sweet-hour-of-prayer",
    title: "Sweet Hour of Prayer",
    author: "William W. Walford",
    year: 1845,
    verses: [
      "Sweet hour of prayer! Sweet hour of prayer!\nThat calls me from a world of care,\nAnd bids me at my Father's throne\nMake all my wants and wishes known.\nIn seasons of distress and grief,\nMy soul has often found relief,\nAnd oft escaped the tempter's snare\nBy thy return, sweet hour of prayer!",
      "Sweet hour of prayer! Sweet hour of prayer!\nThy wings shall my petition bear\nTo Him whose truth and faithfulness\nEngage the waiting soul to bless.\nAnd since He bids me seek His face,\nBelieve His Word and trust His grace,\nI'll cast on Him my every care\nAnd wait for thee, sweet hour of prayer!",
      "Sweet hour of prayer! Sweet hour of prayer!\nMay I thy consolation share,\nTill, from Mount Pisgah's lofty height,\nI view my home and take my flight;\nThis robe of flesh I'll drop, and rise\nTo seize the everlasting prize;\nAnd shout, while passing through the air,\nFarewell, farewell, sweet hour of prayer!",
    ],
  },
  {
    id: "onward-christian-soldiers",
    title: "Onward, Christian Soldiers",
    author: "Sabine Baring-Gould",
    year: 1865,
    verses: [
      "Onward, Christian soldiers,\nMarching as to war,\nWith the cross of Jesus\nGoing on before!\nChrist, the royal Master,\nLeads against the foe;\nForward into battle\nSee His banners go!",
      "Like a mighty army\nMoves the Church of God;\nBrothers, we are treading\nWhere the saints have trod;\nWe are not divided,\nAll one body we,\nOne in hope and doctrine,\nOne in charity.",
      "Crowns and thrones may perish,\nKingdoms rise and wane,\nBut the Church of Jesus\nConstant will remain;\nGates of hell can never\n'Gainst that Church prevail;\nWe have Christ's own promise,\nAnd that cannot fail.",
      "Onward, then, ye people,\nJoin our happy throng,\nBlend with ours your voices\nIn the triumph song;\nGlory, laud and honor\nUnto Christ the King,\nThis through countless ages\nMen and angels sing.",
    ],
    chorus:
      "Onward, Christian soldiers,\nMarching as to war,\nWith the cross of Jesus\nGoing on before!",
  },
  {
    id: "to-god-be-the-glory",
    title: "To God Be the Glory",
    author: "Fanny Crosby",
    year: 1875,
    verses: [
      "To God be the glory, great things He hath taught us,\nGreat things He hath done, and great our rejoicing\nThrough Jesus the Son;\nBut purer and higher and greater will be\nOur wonder, our transport, when Jesus we see.",
      "O perfect redemption, the purchase of blood,\nTo every believer the promise of God;\nThe vilest offender who truly believes,\nThat moment from Jesus a pardon receives.",
      "Great things He hath taught us, great things He hath done,\nAnd great our rejoicing through Jesus the Son;\nBut purer and higher and greater will be\nOur wonder, our transport, when Jesus we see.",
    ],
    chorus:
      "Praise the Lord, praise the Lord,\nLet the earth hear His voice!\nPraise the Lord, praise the Lord,\nLet the people rejoice!\nO come to the Father, through Jesus the Son,\nAnd give Him the glory; great things He hath done.",
  },
  {
    id: "for-beauty-of-earth",
    title: "For the Beauty of the Earth",
    author: "Folliot S. Pierpoint",
    year: 1864,
    verses: [
      "For the beauty of the earth,\nFor the glory of the skies,\nFor the love which from our birth\nOver and around us lies:",
      "For the wonder of each hour\nOf the day and of the night,\nHill and vale, and tree and flower,\nSun and moon and stars of light:",
      "For the joy of human love,\nBrother, sister, parent, child,\nFriends on earth, and friends above,\nFor all gentle thoughts and mild:",
      "For Thy Church that evermore\nLifteth holy hands above,\nOffering up on every shore\nHer pure sacrifice of love:",
    ],
    chorus: "Lord of all, to Thee we raise\nThis our hymn of grateful praise.",
  },
  {
    id: "o-worship-the-king",
    title: "O Worship the King",
    author: "Robert Grant",
    year: 1833,
    verses: [
      "O worship the King, all glorious above,\nO gratefully sing His power and His love;\nOur Shield and Defender, the Ancient of Days,\nPavilioned in splendor, and girded with praise.",
      "O tell of His might, O sing of His grace,\nWhose robe is the light, whose canopy space;\nHis chariots of wrath the deep thunderclouds form,\nAnd dark is His path on the wings of the storm.",
      "Thy bountiful care, what tongue can recite?\nIt breathes in the air, it shines in the light;\nIt streams from the hills, it descends to the plain,\nAnd sweetly distills in the dew and the rain.",
      "Frail children of dust, and feeble as frail,\nIn Thee do we trust, nor find Thee to fail;\nThy mercies how tender, how firm to the end,\nOur Maker, Defender, Redeemer, and Friend.",
    ],
  },
  {
    id: "o-god-our-help",
    title: "O God, Our Help in Ages Past",
    author: "Isaac Watts",
    year: 1719,
    verses: [
      "O God, our help in ages past,\nOur hope for years to come,\nOur shelter from the stormy blast,\nAnd our eternal home!",
      "Under the shadow of Thy throne\nStill may we dwell secure;\nSufficient is Thine arm alone,\nAnd our defense is sure.",
      "Before the hills in order stood,\nOr earth received her frame,\nFrom everlasting Thou art God,\nTo endless years the same.",
      "A thousand ages in Thy sight\nAre like an evening gone;\nShort as the watch that ends the night\nBefore the rising sun.",
      "Time, like an ever-rolling stream,\nBears all its sons away;\nThey fly forgotten, as a dream\nDies at the opening day.",
    ],
  },
  {
    id: "guide-me",
    title: "Guide Me, O Thou Great Jehovah",
    author: "William Williams",
    year: 1745,
    verses: [
      "Guide me, O Thou great Jehovah,\nPilgrim through this barren land;\nI am weak, but Thou art mighty,\nHold me with Thy powerful hand;\nBread of heaven, bread of heaven,\nFeed me till I want no more.",
      "Open now the crystal fountain,\nWhence the healing stream doth flow;\nLet the fire and cloudy pillar\nLead me all my journey through;\nStrong Deliverer, strong Deliverer,\nBe Thou still my strength and shield.",
      "When I tread the verge of Jordan,\nBid my anxious fears subside;\nDeath of death, and hell's Destruction,\nLand me safe on Canaan's side;\nSongs of praises, songs of praises,\nI will ever give to Thee.",
    ],
  },
  {
    id: "immortal-invisible",
    title: "Immortal, Invisible, God Only Wise",
    author: "Walter Chalmers Smith",
    year: 1867,
    verses: [
      "Immortal, invisible, God only wise,\nIn light inaccessible hid from our eyes,\nMost blessèd, most glorious, the Ancient of Days,\nAlmighty, victorious, Thy great name we praise.",
      "Unresting, unhasting, and silent as light,\nNor wanting, nor wasting, Thou rulest in might;\nThy justice like mountains high soaring above,\nThy clouds which are fountains of goodness and love.",
      "To all life Thou givest, to both great and small;\nIn all life Thou livest, the true life of all;\nWe blossom and flourish as leaves on the tree,\nAnd wither and perish—but naught changeth Thee.",
      "Great Father of glory, pure Father of light,\nThine angels adore Thee, all veiling their sight;\nAll praise we would render; O help us to see\n'Tis only the splendor of light hideth Thee!",
    ],
  },
  {
    id: "jesus-loves-me",
    title: "Jesus Loves Me",
    author: "Anna B. Warner",
    year: 1860,
    verses: [
      "Jesus loves me! This I know,\nFor the Bible tells me so;\nLittle ones to Him belong;\nThey are weak, but He is strong.",
      "Jesus loves me! He who died\nHeaven's gate to open wide;\nHe will wash away my sin,\nLet His little child come in.",
      "Jesus loves me! He will stay\nClose beside me all the way;\nThou hast bled and died for me,\nI will henceforth live for Thee.",
    ],
    chorus: "Yes, Jesus loves me! Yes, Jesus loves me!\nYes, Jesus loves me! The Bible tells me so.",
  },
  {
    id: "count-your-blessings",
    title: "Count Your Blessings",
    author: "Johnson Oatman Jr.",
    year: 1897,
    verses: [
      "When upon life's billows you are tempest tossed,\nWhen you are discouraged, thinking all is lost,\nCount your many blessings, name them one by one,\nAnd it will surprise you what the Lord hath done.",
      "Are you ever burdened with a load of care?\nDoes the cross seem heavy you are called to bear?\nCount your many blessings, every doubt will fly,\nAnd you will be singing as the days go by.",
      "When you look at others with their lands and gold,\nThink that Christ has promised you His wealth untold;\nCount your many blessings, money cannot buy\nYour reward in heaven nor your home on high.",
      "So amid the conflict, whether great or small,\nDo not be discouraged, God is over all;\nCount your many blessings, angels will attend,\nHelp and comfort give you to your journey's end.",
    ],
    chorus:
      "Count your blessings, name them one by one;\nCount your blessings, see what God hath done;\nCount your blessings, name them one by one;\nCount your many blessings, see what God hath done.",
  },
  {
    id: "stand-up-for-jesus",
    title: "Stand Up, Stand Up for Jesus",
    author: "George Duffield Jr.",
    year: 1858,
    verses: [
      "Stand up, stand up for Jesus,\nYe soldiers of the cross;\nLift high His royal banner,\nIt must not suffer loss;\nFrom victory unto victory\nHis army shall He lead,\nTill every foe is vanquished\nAnd Christ is Lord indeed.",
      "Stand up, stand up for Jesus,\nThe trumpet call obey;\nForth to the mighty conflict\nIn this His glorious day;\nYe that are men now serve Him\nAgainst unnumbered foes;\nLet courage rise with danger,\nAnd strength to strength oppose.",
      "Stand up, stand up for Jesus,\nStand in His strength alone;\nThe arm of flesh will fail you,\nYe dare not trust your own;\nPut on the gospel armor,\nEach piece put on with prayer;\nWhere duty calls or danger,\nBe never wanting there.",
      "Stand up, stand up for Jesus,\nThe strife will not be long;\nThis day the noise of battle,\nThe next the victor's song;\nTo him that overcometh\nA crown of life shall be;\nHe with the King of glory\nShall reign eternally.",
    ],
  },
  {
    id: "o-for-a-thousand-tongues",
    title: "O for a Thousand Tongues to Sing",
    author: "Charles Wesley",
    year: 1739,
    verses: [
      "O for a thousand tongues to sing\nMy great Redeemer's praise,\nThe glories of my God and King,\nThe triumphs of His grace!",
      "My gracious Master and my God,\nAssist me to proclaim,\nTo spread through all the earth abroad\nThe honors of Thy name.",
      "Jesus! the name that charms our fears,\nThat bids our sorrows cease;\n'Tis music in the sinner's ears,\n'Tis life, and health, and peace.",
      "He breaks the power of canceled sin,\nHe sets the prisoner free;\nHis blood can make the foulest clean,\nHis blood availed for me.",
      "Hear Him, ye deaf; His praise, ye dumb,\nYour loosened tongues employ;\nYe blind, behold your Savior come,\nAnd leap, ye lame, for joy.",
    ],
  },
  {
    id: "praise-to-the-lord",
    title: "Praise to the Lord, the Almighty",
    author: "Joachim Neander",
    year: 1680,
    verses: [
      "Praise to the Lord, the Almighty, the King of creation!\nO my soul, praise Him, for He is thy health and salvation!\nAll ye who hear, now to His temple draw near;\nJoin me in glad adoration!",
      "Praise to the Lord, who o'er all things so wondrously reigneth,\nShelters thee under His wings, yea, so gently sustaineth!\nHast thou not seen how thy desires e'er have been\nGranted in what He ordaineth?",
      "Praise to the Lord, who doth prosper thy work and defend thee;\nSurely His goodness and mercy here daily attend thee;\nPonder anew what the Almighty can do,\nIf with His love He befriend thee.",
      "Praise to the Lord! O let all that is in me adore Him!\nAll that hath life and breath, come now with praises before Him!\nLet the Amen sound from His people again;\nGladly for aye we adore Him.",
    ],
  },
  {
    id: "in-the-garden",
    title: "In the Garden",
    author: "C. Austin Miles",
    year: 1912,
    verses: [
      "I come to the garden alone,\nWhile the dew is still on the roses;\nAnd the voice I hear, falling on my ear,\nThe Son of God discloses.",
      "He speaks, and the sound of His voice\nIs so sweet the birds hush their singing;\nAnd the melody that He gave to me\nWithin my heart is ringing.",
      "I'd stay in the garden with Him\nThough the night around me be falling;\nBut He bids me go; through the voice of woe,\nHis voice to me is calling.",
    ],
    chorus:
      "And He walks with me, and He talks with me,\nAnd He tells me I am His own;\nAnd the joy we share as we tarry there,\nNone other has ever known.",
  },
  {
    id: "leaning",
    title: "Leaning on the Everlasting Arms",
    author: "Elisha A. Hoffman",
    year: 1887,
    verses: [
      "What a fellowship, what a joy divine,\nLeaning on the everlasting arms;\nWhat a blessedness, what a peace is mine,\nLeaning on the everlasting arms.",
      "O how sweet to walk in this pilgrim way,\nLeaning on the everlasting arms;\nO how bright the path grows from day to day,\nLeaning on the everlasting arms.",
      "What have I to dread, what have I to fear,\nLeaning on the everlasting arms;\nI have blessèd peace with my Lord so near,\nLeaning on the everlasting arms.",
    ],
    chorus:
      "Leaning, leaning,\nSafe and secure from all alarms;\nLeaning, leaning,\nLeaning on the everlasting arms.",
  },
  {
    id: "nothing-but-the-blood",
    title: "Nothing but the Blood",
    author: "Robert Lowry",
    year: 1876,
    verses: [
      "What can wash away my sin?\nNothing but the blood of Jesus;\nWhat can make me whole again?\nNothing but the blood of Jesus.",
      "For my pardon this I see—\nNothing but the blood of Jesus;\nFor my cleansing this my plea—\nNothing but the blood of Jesus.",
      "Nothing can for sin atone—\nNothing but the blood of Jesus;\nNaught of good that I have done—\nNothing but the blood of Jesus.",
      "This is all my hope and peace—\nNothing but the blood of Jesus;\nThis is all my righteousness—\nNothing but the blood of Jesus.",
    ],
    chorus:
      "Oh! precious is the flow\nThat makes me white as snow;\nNo other fount I know,\nNothing but the blood of Jesus.",
  },
  {
    id: "o-happy-day",
    title: "O Happy Day",
    author: "Philip Doddridge",
    year: 1755,
    verses: [
      "O happy day, that fixed my choice\nOn Thee, my Savior and my God!\nWell may this glowing heart rejoice,\nAnd tell its raptures all abroad.",
      "O happy bond, that seals my vows\nTo Him who merits all my love!\nLet cheerful anthems fill His house,\nWhile to that sacred shrine I move.",
      "'Tis done, the great transaction's done;\nI am my Lord's, and He is mine;\nHe drew me, and I followed on,\nCharm'd to confess the voice divine.",
      "Now rest, my long-divided heart;\nFixed on this blissful center, rest;\nNor ever from thy Lord depart,\nWith Him of every good possessed.",
    ],
    chorus:
      "Happy day, happy day,\nWhen Jesus washed my sins away!\nHe taught me how to watch and pray,\nAnd live rejoicing every day;\nHappy day, happy day,\nWhen Jesus washed my sins away!",
  },
  {
    id: "beneath-the-cross",
    title: "Beneath the Cross of Jesus",
    author: "Elizabeth C. Clephane",
    year: 1868,
    verses: [
      "Beneath the cross of Jesus\nI fain would take my stand,\nThe shadow of a mighty rock\nWithin a weary land;\nA home within the wilderness,\nA rest upon the way,\nFrom the burning of the noontide heat,\nAnd the burden of the day.",
      "O safe and happy shelter,\nO refuge tried and sweet,\nO trysting place where Heaven's love\nAnd Heaven's justice meet!\nAs to the holy patriarch\nThat wondrous dream was given,\nSo seems my Savior's cross to me\nA ladder up to heaven.",
      "Upon that cross of Jesus\nMine eye at times can see\nThe very dying form of One\nWho suffered there for me;\nAnd from my smitten heart with tears\nTwo wonders I confess—\nThe wonders of redeeming love\nAnd my unworthiness.",
    ],
  },
  {
    id: "just-as-i-am",
    title: "Just As I Am",
    author: "Charlotte Elliott",
    year: 1835,
    verses: [
      "Just as I am, without one plea,\nBut that Thy blood was shed for me,\nAnd that Thou bid'st me come to Thee,\nO Lamb of God, I come, I come.",
      "Just as I am, and waiting not\nTo rid my soul of one dark blot,\nTo Thee whose blood can cleanse each spot,\nO Lamb of God, I come, I come.",
      "Just as I am, though tossed about\nWith many a conflict, many a doubt,\nFightings and fears within, without,\nO Lamb of God, I come, I come.",
      "Just as I am, poor, wretched, blind;\nSight, riches, healing of the mind,\nYea, all I need in Thee to find,\nO Lamb of God, I come, I come.",
      "Just as I am, Thou wilt receive,\nWilt welcome, pardon, cleanse, relieve;\nBecause Thy promise I believe,\nO Lamb of God, I come, I come.",
    ],
  },
  {
    id: "softly-and-tenderly",
    title: "Softly and Tenderly",
    author: "Will L. Thompson",
    year: 1880,
    verses: [
      "Softly and tenderly Jesus is calling,\nCalling for you and for me;\nSee, on the portals He's waiting and watching,\nWatching for you and for me.",
      "Why should we tarry when Jesus is pleading,\nPleading for you and for me?\nWhy should we linger and heed not His mercies,\nMercies for you and for me?",
      "Time is now fleeting, the moments are passing,\nPassing from you and from me;\nShadows are gathering, deathbeds are coming,\nComing for you and for me.",
      "Oh, for the wonderful love He has promised,\nPromised for you and for me!\nThough we have sinned, He has mercy and pardon,\nPardon for you and for me.",
    ],
    chorus:
      "Come home, come home,\nYe who are weary, come home;\nEarnestly, tenderly, Jesus is calling,\nCalling, O sinner, come home!",
  },
  {
    id: "when-we-all-get-to-heaven",
    title: "When We All Get to Heaven",
    author: "Eliza E. Hewitt",
    year: 1898,
    verses: [
      "Sing the wondrous love of Jesus,\nSing His mercy and His grace;\nIn the mansions bright and blessèd\nHe'll prepare for us a place.",
      "While we walk the pilgrim pathway,\nClouds will overspread the sky;\nBut when traveling days are over,\nNot a shadow, not a sigh.",
      "Let us then be true and faithful,\nTrusting, serving every day;\nJust one glimpse of Him in glory\nWill the toils of life repay.",
      "Onward to the prize before us!\nSoon His beauty we'll behold;\nSoon the pearly gates will open,\nWe shall tread the streets of gold.",
    ],
    chorus:
      "When we all get to heaven,\nWhat a day of rejoicing that will be!\nWhen we all see Jesus,\nWe'll sing and shout the victory!",
  },
  {
    id: "tis-so-sweet",
    title: "'Tis So Sweet to Trust in Jesus",
    author: "Louisa M. R. Stead",
    year: 1882,
    verses: [
      "'Tis so sweet to trust in Jesus,\nJust to take Him at His word;\nJust to rest upon His promise,\nJust to know, 'Thus saith the Lord!'",
      "O how sweet to trust in Jesus,\nJust to trust His cleansing blood;\nJust in simple faith to plunge me\n'Neath the healing, cleansing flood!",
      "Yes, 'tis sweet to trust in Jesus,\nJust from sin and self to cease;\nJust from Jesus simply taking\nLife and rest and joy and peace.",
      "I'm so glad I learned to trust Thee,\nPrecious Jesus, Savior, Friend;\nAnd I know that Thou art with me,\nWilt be with me to the end.",
    ],
    chorus:
      "Jesus, Jesus, how I trust Him!\nHow I've proved Him o'er and o'er!\nJesus, Jesus, precious Jesus!\nOh, for grace to trust Him more!",
  },
  {
    id: "near-the-cross",
    title: "Jesus, Keep Me Near the Cross",
    author: "Fanny Crosby",
    year: 1869,
    verses: [
      "Jesus, keep me near the cross,\nThere a precious fountain\nFree to all, a healing stream,\nFlows from Calvary's mountain.",
      "Near the cross, a trembling soul,\nLove and mercy found me;\nThere the bright and morning star\nSheds its beams around me.",
      "Near the cross! O Lamb of God,\nBring its scenes before me;\nHelp me walk from day to day\nWith its shadow o'er me.",
      "Near the cross I'll watch and wait,\nHoping, trusting ever,\nTill I reach the golden strand\nJust beyond the river.",
    ],
    chorus:
      "In the cross, in the cross,\nBe my glory ever;\nTill my raptured soul shall find\nRest beyond the river.",
  },
  {
    id: "all-hail-the-power",
    title: "All Hail the Power of Jesus' Name",
    author: "Edward Perronet",
    year: 1779,
    verses: [
      "All hail the power of Jesus' name!\nLet angels prostrate fall;\nBring forth the royal diadem,\nAnd crown Him Lord of all!",
      "Crown Him, ye martyrs of our God,\nWho from His altar call;\nExtol the Stem of Jesse's rod,\nAnd crown Him Lord of all!",
      "Ye seed of Israel's chosen race,\nYe ransomed from the fall,\nHail Him who saves you by His grace,\nAnd crown Him Lord of all!",
      "Let every kindred, every tribe\nOn this terrestrial ball,\nTo Him all majesty ascribe,\nAnd crown Him Lord of all!",
      "O that with yonder sacred throng\nWe at His feet may fall!\nWe'll join the everlasting song\nAnd crown Him Lord of all!",
    ],
  },
  {
    id: "doxology",
    title: "Praise God, from Whom All Blessings Flow",
    author: "Thomas Ken",
    year: 1709,
    verses: [
      "Praise God, from whom all blessings flow;\nPraise Him, all creatures here below;\nPraise Him above, ye heavenly host;\nPraise Father, Son, and Holy Ghost. Amen.",
    ],
  },
  {
    id: "be-thou-my-vision",
    title: "Be Thou My Vision",
    author: "Dallan Forgaill (tr. Mary E. Byrne)",
    year: 700,
    verses: [
      "Be Thou my vision, O Lord of my heart;\nNaught be all else to me, save that Thou art;\nThou my best thought, by day or by night,\nWaking or sleeping, Thy presence my light.",
      "Be Thou my wisdom, and Thou my true Word;\nI ever with Thee and Thou with me, Lord;\nThou my great Father, I Thy true son;\nThou in me dwelling, and I with Thee one.",
      "Riches I heed not, nor man's empty praise,\nThou mine inheritance, now and always;\nThou and Thou only, first in my heart,\nHigh King of heaven, my treasure Thou art.",
      "High King of heaven, my victory won,\nMay I reach heaven's joys, O bright heaven's Sun!\nHeart of my own heart, whatever befall,\nStill be my vision, O Ruler of all.",
    ],
  },
  {
    id: "all-creatures-of-our-god",
    title: "All Creatures of Our God and King",
    author: "Francis of Assisi (tr. William H. Draper)",
    year: 1225,
    verses: [
      "All creatures of our God and King,\nLift up your voice and with us sing,\nAlleluia! Alleluia!\nThou burning sun with golden beam,\nThou silver moon with softer gleam!",
      "Thou rushing wind that art so strong,\nYe clouds that sail in heaven along,\nO praise Him! Alleluia!\nThou rising moon, in praise rejoice,\nYe lights of evening, find a voice!",
      "Thou flowing water, pure and clear,\nMake music for thy Lord to hear,\nAlleluia! Alleluia!\nThou fire so masterful and bright,\nThat givest man both warmth and light.",
      "And all ye men of tender heart,\nForgiving others, take your part,\nO sing ye! Alleluia!\nYe who long pain and sorrow bear,\nPraise God and on Him cast your care!",
    ],
    chorus: "O praise Him! O praise Him!\nAlleluia! Alleluia! Alleluia!",
  },
  {
    id: "fairest-lord-jesus",
    title: "Fairest Lord Jesus",
    author: "German 17th century",
    year: 1677,
    verses: [
      "Fairest Lord Jesus, Ruler of all nature,\nO Thou of God and man the Son,\nThee will I cherish, Thee will I honor,\nThou, my soul's glory, joy, and crown.",
      "Fair are the meadows, fairer still the woodlands,\nRobed in the blooming garb of spring;\nJesus is fairer, Jesus is purer,\nWho makes the woeful heart to sing.",
      "Fair is the sunshine, fairer still the moonlight,\nAnd all the twinkling starry host;\nJesus shines brighter, Jesus shines purer\nThan all the angels heaven can boast.",
      "Beautiful Savior! Lord of all the nations!\nSon of God and Son of Man!\nGlory and honor, praise, adoration,\nNow and forevermore be Thine.",
    ],
  },
  {
    id: "i-need-thee-every-hour",
    title: "I Need Thee Every Hour",
    author: "Annie S. Hawks",
    year: 1872,
    verses: [
      "I need Thee every hour, most gracious Lord;\nNo tender voice like Thine can peace afford.",
      "I need Thee every hour, stay Thou nearby;\nTemptations lose their power when Thou art nigh.",
      "I need Thee every hour, in joy or pain;\nCome quickly and abide, or life is vain.",
      "I need Thee every hour; teach me Thy will;\nAnd Thy rich promises in me fulfill.",
    ],
    chorus:
      "I need Thee, O I need Thee;\nEvery hour I need Thee;\nO bless me now, my Savior,\nI come to Thee.",
  },
  {
    id: "my-faith-looks-up",
    title: "My Faith Looks Up to Thee",
    author: "Ray Palmer",
    year: 1830,
    verses: [
      "My faith looks up to Thee,\nThou Lamb of Calvary,\nSavior divine!\nNow hear me while I pray,\nTake all my guilt away,\nO let me from this day\nBe wholly Thine!",
      "May Thy rich grace impart\nStrength to my fainting heart,\nMy zeal inspire;\nAs Thou hast died for me,\nO may my love to Thee\nPure, warm, and changeless be,\nA living fire!",
      "While life's dark maze I tread,\nAnd griefs around me spread,\nBe Thou my guide;\nBid darkness turn to day,\nWipe sorrow's tears away,\nNor let me ever stray\nFrom Thee aside.",
      "When ends life's transient dream,\nWhen death's cold, sullen stream\nShall o'er me roll;\nBlest Savior, then, in love,\nFear and distrust remove;\nO bear me safe above,\nA ransomed soul!",
    ],
  },
  {
    id: "pass-me-not",
    title: "Pass Me Not, O Gentle Savior",
    author: "Fanny Crosby",
    year: 1868,
    verses: [
      "Pass me not, O gentle Savior,\nHear my humble cry;\nWhile on others Thou art calling,\nDo not pass me by.",
      "Let me at a throne of mercy\nFind a sweet relief;\nKneeling there in deep contrition,\nHelp my unbelief.",
      "Trusting only in Thy merit,\nWould I seek Thy face;\nHeal my wounded, broken spirit,\nSave me by Thy grace.",
      "Thou the Spring of all my comfort,\nMore than life to me,\nWhom have I on earth beside Thee?\nWhom in heaven but Thee?",
    ],
    chorus:
      "Savior, Savior,\nHear my humble cry;\nWhile on others Thou art calling,\nDo not pass me by.",
  },
  {
    id: "jesus-paid-it-all",
    title: "Jesus Paid It All",
    author: "Elvina M. Hall",
    year: 1865,
    verses: [
      "I hear the Savior say,\n\"Thy strength indeed is small,\nChild of weakness, watch and pray,\nFind in Me thine all in all.\"",
      "For nothing good have I\nWhereby Thy grace to claim;\nI'll wash my garments white\nIn the blood of Calvary's Lamb.",
      "And now complete in Him\nMy robe, His righteousness,\nClose sheltered 'neath His side,\nI am divinely blest.",
      "Lord, now indeed I find\nThy power, and Thine alone,\nCan change the leper's spots\nAnd melt the heart of stone.",
    ],
    chorus:
      "Jesus paid it all,\nAll to Him I owe;\nSin had left a crimson stain,\nHe washed it white as snow.",
  },
  {
    id: "take-my-life",
    title: "Take My Life and Let It Be",
    author: "Frances Ridley Havergal",
    year: 1874,
    verses: [
      "Take my life and let it be\nConsecrated, Lord, to Thee;\nTake my moments and my days,\nLet them flow in ceaseless praise.",
      "Take my hands and let them move\nAt the impulse of Thy love;\nTake my feet and let them be\nSwift and beautiful for Thee.",
      "Take my voice and let me sing\nAlways, only, for my King;\nTake my lips and let them be\nFilled with messages from Thee.",
      "Take my will and make it Thine;\nIt shall be no longer mine;\nTake my heart, it is Thine own;\nIt shall be Thy royal throne.",
      "Take my love; my Lord, I pour\nAt Thy feet its treasure store;\nTake myself, and I will be\nEver, only, all for Thee.",
    ],
  },
  {
    id: "he-leadeth-me",
    title: "He Leadeth Me",
    author: "Joseph H. Gilmore",
    year: 1862,
    verses: [
      "He leadeth me! O blessèd thought!\nO words with heavenly comfort fraught!\nWhate'er I do, where'er I be,\nStill 'tis God's hand that leadeth me.",
      "Sometimes 'mid scenes of deepest gloom,\nSometimes where Eden's bowers bloom,\nBy waters still, o'er troubled sea,\nStill 'tis His hand that leadeth me.",
      "Lord, I would place my hand in Thine,\nNor ever murmur nor repine;\nContent, whatever lot I see,\nSince 'tis Thy hand that leadeth me.",
      "And when my task on earth is done,\nWhen by Thy grace the victory's won,\nE'en death's cold wave I will not flee,\nSince God through Jordan leadeth me.",
    ],
    chorus:
      "He leadeth me, He leadeth me,\nBy His own hand He leadeth me;\nHis faithful follower I would be,\nFor by His hand He leadeth me.",
  },
  {
    id: "the-solid-rock",
    title: "My Hope Is Built on Nothing Less",
    author: "Edward Mote",
    year: 1834,
    verses: [
      "My hope is built on nothing less\nThan Jesus' blood and righteousness;\nI dare not trust the sweetest frame,\nBut wholly lean on Jesus' name.",
      "When darkness veils His lovely face,\nI rest on His unchanging grace;\nIn every high and stormy gale,\nMy anchor holds within the veil.",
      "His oath, His covenant, His blood,\nSupport me in the whelming flood;\nWhen all around my soul gives way,\nHe then is all my hope and stay.",
      "When He shall come with trumpet sound,\nO may I then in Him be found;\nDressed in His righteousness alone,\nFaultless to stand before the throne.",
    ],
    chorus:
      "On Christ, the solid Rock, I stand;\nAll other ground is sinking sand,\nAll other ground is sinking sand.",
  },
  {
    id: "i-love-to-tell-the-story",
    title: "I Love to Tell the Story",
    author: "Katherine Hankey",
    year: 1866,
    verses: [
      "I love to tell the story\nOf unseen things above,\nOf Jesus and His glory,\nOf Jesus and His love.\nI love to tell the story,\nBecause I know 'tis true;\nIt satisfies my longings\nAs nothing else can do.",
      "I love to tell the story;\nMore wonderful it seems\nThan all the golden fancies\nOf all our golden dreams.\nI love to tell the story,\nIt did so much for me;\nAnd that is just the reason\nI tell it now to thee.",
      "I love to tell the story;\n'Tis pleasant to repeat\nWhat seems each time I tell it\nMore wonderfully sweet.\nI love to tell the story,\nFor some have never heard\nThe message of salvation\nFrom God's own holy Word.",
      "I love to tell the story,\nFor those who know it best\nSeem hungering and thirsting\nTo hear it like the rest.\nAnd when in scenes of glory,\nI sing the new, new song,\n'Twill be the old, old story\nThat I have loved so long.",
    ],
    chorus:
      "I love to tell the story!\nAnd I'll repeat the story,\nOf Jesus and His glory,\nOf Jesus and His love.",
  },
  {
    id: "to-canaan-s-land",
    title: "I Am Bound for the Promised Land",
    author: "Samuel Stennett",
    year: 1787,
    verses: [
      "On Jordan's stormy banks I stand,\nAnd cast a wishful eye\nTo Canaan's fair and happy land,\nWhere my possessions lie.",
      "O'er all those wide extended plains\nShines one eternal day;\nThere God the Son forever reigns\nAnd scatters night away.",
      "When I shall reach that happy place,\nI'll be forever blest;\nFor I shall see my Father's face\nAnd in His bosom rest.",
    ],
    chorus: "I am bound for the promised land,\nI am bound for the promised land;\nOh, who will come and go with me?\nI am bound for the promised land.",
  },
  {
    id: "joy-to-the-world",
    title: "Joy to the World",
    author: "Isaac Watts",
    year: 1719,
    verses: [
      "Joy to the world! The Lord is come;\nLet earth receive her King;\nLet every heart prepare Him room,\nAnd heaven and nature sing,\nAnd heaven and nature sing,\nAnd heaven, and heaven, and nature sing.",
      "Joy to the world! The Savior reigns;\nLet men their songs employ;\nWhile fields and floods, rocks, hills, and plains\nRepeat the sounding joy,\nRepeat the sounding joy,\nRepeat, repeat the sounding joy.",
      "He rules the world with truth and grace,\nAnd makes the nations prove\nThe glories of His righteousness,\nAnd wonders of His love,\nAnd wonders of His love,\nAnd wonders, wonders of His love.",
    ],
  },
  {
    id: "hark-herald-angels",
    title: "Hark! The Herald Angels Sing",
    author: "Charles Wesley",
    year: 1739,
    verses: [
      "Hark! the herald angels sing,\n\"Glory to the newborn King;\nPeace on earth, and mercy mild,\nGod and sinners reconciled!\"\nJoyful, all ye nations, rise,\nJoin the triumph of the skies;\nWith th' angelic host proclaim,\n\"Christ is born in Bethlehem!\"",
      "Christ, by highest heaven adored;\nChrist, the everlasting Lord;\nLate in time behold Him come,\nOffspring of a Virgin's womb.\nVeiled in flesh the Godhead see;\nHail th' incarnate Deity,\nPleased as man with man to dwell;\nJesus, our Emmanuel.",
      "Hail the heaven-born Prince of Peace!\nHail the Sun of Righteousness!\nLight and life to all He brings,\nRisen with healing in His wings.\nMild He lays His glory by,\nBorn that man no more may die,\nBorn to raise the sons of earth,\nBorn to give them second birth.",
    ],
    chorus: "Hark! the herald angels sing,\n\"Glory to the newborn King!\"",
  },
  {
    id: "o-come-all-ye-faithful",
    title: "O Come, All Ye Faithful",
    author: "John Francis Wade",
    year: 1743,
    verses: [
      "O come, all ye faithful, joyful and triumphant,\nO come ye, O come ye to Bethlehem;\nCome and behold Him, born the King of angels;",
      "Sing, choirs of angels, sing in exultation,\nSing, all ye citizens of heaven above!\nGlory to God, glory in the highest;",
      "Yea, Lord, we greet Thee, born this happy morning;\nJesus, to Thee be glory given;\nWord of the Father, now in flesh appearing;",
    ],
    chorus: "O come, let us adore Him,\nO come, let us adore Him,\nO come, let us adore Him,\nChrist the Lord.",
  },
  {
    id: "away-in-a-manger",
    title: "Away in a Manger",
    author: "Anonymous",
    year: 1885,
    verses: [
      "Away in a manger, no crib for a bed,\nThe little Lord Jesus laid down His sweet head;\nThe stars in the bright sky looked down where He lay,\nThe little Lord Jesus asleep on the hay.",
      "The cattle are lowing, the Baby awakes,\nBut little Lord Jesus no crying He makes;\nI love Thee, Lord Jesus! Look down from the sky,\nAnd stay by my side until morning is nigh.",
      "Be near me, Lord Jesus; I ask Thee to stay\nClose by me forever, and love me, I pray;\nBless all the dear children in Thy tender care,\nAnd fit us for heaven to live with Thee there.",
    ],
  },
  {
    id: "silent-night",
    title: "Silent Night",
    author: "Joseph Mohr",
    year: 1818,
    verses: [
      "Silent night, holy night,\nAll is calm, all is bright\nRound yon virgin mother and Child.\nHoly infant so tender and mild,\nSleep in heavenly peace,\nSleep in heavenly peace.",
      "Silent night, holy night,\nShepherds quake at the sight;\nGlories stream from heaven afar,\nHeavenly hosts sing Alleluia!\nChrist the Savior is born,\nChrist the Savior is born!",
      "Silent night, holy night,\nSon of God, love's pure light;\nRadiant beams from Thy holy face\nWith the dawn of redeeming grace,\nJesus, Lord, at Thy birth,\nJesus, Lord, at Thy birth.",
    ],
  },
];
