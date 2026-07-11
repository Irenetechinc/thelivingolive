// A starter set of public-domain hymns (pre-1929 US publication, copyright expired).
// Real, complete lyrics — not placeholder text. Expand this list in a follow-up task
// to cover a full hymnbook.
export type Hymn = {
  id: string;
  title: string;
  author: string;
  year: number;
  verses: string[];
  chorus?: string;
};

export const hymns: Hymn[] = [
  {
    id: "amazing-grace",
    title: "Amazing Grace",
    author: "John Newton",
    year: 1779,
    verses: [
      "Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found,\nWas blind, but now I see.",
      "'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.",
      "Through many dangers, toils, and snares,\nI have already come;\n'Tis grace hath brought me safe thus far,\nAnd grace will lead me home.",
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
      "Fear not, I am with thee, O be not dismayed,\nFor I am thy God and will still give thee aid;\nI'll strengthen thee, help thee, and cause thee to stand,\nUpheld by My righteous, omnipotent hand.",
      "When through the deep waters I call thee to go,\nThe rivers of sorrow shall not overflow;\nFor I will be with thee, thy troubles to bless,\nAnd sanctify to thee thy deepest distress.",
    ],
  },
  {
    id: "blessed-assurance",
    title: "Blessed Assurance",
    author: "Fanny Crosby",
    year: 1873,
    verses: [
      "Blessed assurance, Jesus is mine!\nOh, what a foretaste of glory divine!\nHeir of salvation, purchase of God,\nBorn of His Spirit, washed in His blood.",
      "Perfect submission, perfect delight,\nVisions of rapture now burst on my sight;\nAngels descending bring from above\nEchoes of mercy, whispers of love.",
      "Perfect submission, all is at rest,\nI in my Savior am happy and blest,\nWatching and waiting, looking above,\nFilled with His goodness, lost in His love.",
    ],
    chorus: "This is my story, this is my song,\nPraising my Savior all the day long.",
  },
  {
    id: "it-is-well",
    title: "It Is Well with My Soul",
    author: "Horatio Spafford",
    year: 1873,
    verses: [
      "When peace, like a river, attendeth my way,\nWhen sorrows like sea billows roll;\nWhatever my lot, Thou hast taught me to say,\nIt is well, it is well with my soul.",
      "Though Satan should buffet, though trials should come,\nLet this blest assurance control,\nThat Christ hath regarded my helpless estate,\nAnd hath shed His own blood for my soul.",
      "My sin, oh, the bliss of this glorious thought,\nMy sin, not in part but the whole,\nIs nailed to the cross, and I bear it no more,\nPraise the Lord, praise the Lord, O my soul!",
    ],
    chorus: "It is well with my soul,\nIt is well, it is well with my soul.",
  },
  {
    id: "holy-holy-holy",
    title: "Holy, Holy, Holy",
    author: "Reginald Heber",
    year: 1826,
    verses: [
      "Holy, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to Thee;\nHoly, holy, holy! Merciful and mighty!\nGod in three Persons, blessed Trinity!",
      "Holy, holy, holy! All the saints adore Thee,\nCasting down their golden crowns around the glassy sea;\nCherubim and seraphim falling down before Thee,\nWhich wert, and art, and evermore shalt be.",
      "Holy, holy, holy! Though the darkness hide Thee,\nThough the eye of sinful man Thy glory may not see;\nOnly Thou art holy; there is none beside Thee,\nPerfect in power, in love, and purity.",
    ],
  },
  {
    id: "what-a-friend",
    title: "What a Friend We Have in Jesus",
    author: "Joseph M. Scriven",
    year: 1855,
    verses: [
      "What a friend we have in Jesus,\nAll our sins and griefs to bear!\nWhat a privilege to carry\nEverything to God in prayer!",
      "Have we trials and temptations?\nIs there trouble anywhere?\nWe should never be discouraged;\nTake it to the Lord in prayer.",
      "Are we weak and heavy laden,\nCumbered with a load of care?\nPrecious Savior, still our refuge,\nTake it to the Lord in prayer.",
    ],
  },
  {
    id: "come-thou-fount",
    title: "Come, Thou Fount of Every Blessing",
    author: "Robert Robinson",
    year: 1758,
    verses: [
      "Come, Thou Fount of every blessing,\nTune my heart to sing Thy grace;\nStreams of mercy, never ceasing,\nCall for songs of loudest praise.",
      "Here I raise my Ebenezer,\nHither by Thy help I'm come;\nAnd I hope, by Thy good pleasure,\nSafely to arrive at home.",
      "O to grace how great a debtor\nDaily I'm constrained to be!\nLet Thy goodness, like a fetter,\nBind my wandering heart to Thee.",
    ],
  },
  {
    id: "when-i-survey",
    title: "When I Survey the Wondrous Cross",
    author: "Isaac Watts",
    year: 1707,
    verses: [
      "When I survey the wondrous cross\nOn which the Prince of glory died,\nMy richest gain I count but loss,\nAnd pour contempt on all my pride.",
      "Forbid it, Lord, that I should boast,\nSave in the death of Christ my God;\nAll the vain things that charm me most,\nI sacrifice them to His blood.",
      "Were the whole realm of nature mine,\nThat were a present far too small;\nLove so amazing, so divine,\nDemands my soul, my life, my all.",
    ],
  },
  {
    id: "just-as-i-am",
    title: "Just As I Am",
    author: "Charlotte Elliott",
    year: 1835,
    verses: [
      "Just as I am, without one plea,\nBut that Thy blood was shed for me,\nAnd that Thou bidd'st me come to Thee,\nO Lamb of God, I come, I come!",
      "Just as I am, and waiting not\nTo rid my soul of one dark blot,\nTo Thee whose blood can cleanse each spot,\nO Lamb of God, I come, I come!",
      "Just as I am, though tossed about\nWith many a conflict, many a doubt,\nFightings and fears within, without,\nO Lamb of God, I come, I come!",
    ],
  },
  {
    id: "old-rugged-cross",
    title: "The Old Rugged Cross",
    author: "George Bennard",
    year: 1913,
    verses: [
      "On a hill far away stood an old rugged cross,\nThe emblem of suffering and shame;\nAnd I love that old cross where the dearest and best\nFor a world of lost sinners was slain.",
      "O that old rugged cross, so despised by the world,\nHas a wondrous attraction for me;\nFor the dear Lamb of God left His glory above\nTo bear it to dark Calvary.",
    ],
    chorus: "So I'll cherish the old rugged cross,\nTill my trophies at last I lay down;\nI will cling to the old rugged cross,\nAnd exchange it some day for a crown.",
  },
  {
    id: "nearer-my-god",
    title: "Nearer, My God, to Thee",
    author: "Sarah F. Adams",
    year: 1841,
    verses: [
      "Nearer, my God, to Thee, nearer to Thee!\nE'en though it be a cross that raiseth me,\nStill all my song shall be, nearer, my God, to Thee,\nNearer, my God, to Thee, nearer to Thee!",
      "Though like the wanderer, the sun gone down,\nDarkness be over me, my rest a stone,\nYet in my dreams I'd be nearer, my God, to Thee,\nNearer, my God, to Thee, nearer to Thee!",
    ],
  },
  {
    id: "to-god-be-the-glory",
    title: "To God Be the Glory",
    author: "Fanny Crosby",
    year: 1875,
    verses: [
      "To God be the glory, great things He hath done,\nSo loved He the world that He gave us His Son,\nWho yielded His life an atonement for sin,\nAnd opened the life gate that all may go in.",
      "O perfect redemption, the purchase of blood,\nTo every believer the promise of God;\nThe vilest offender who truly believes,\nThat moment from Jesus a pardon receives.",
    ],
    chorus: "Praise the Lord, praise the Lord,\nLet the earth hear His voice!\nPraise the Lord, praise the Lord,\nLet the people rejoice!",
  },
  {
    id: "leaning-on-everlasting-arms",
    title: "Leaning on the Everlasting Arms",
    author: "Elisha A. Hoffman",
    year: 1887,
    verses: [
      "What a fellowship, what a joy divine,\nLeaning on the everlasting arms;\nWhat a blessedness, what a peace is mine,\nLeaning on the everlasting arms.",
      "O how sweet to walk in this pilgrim way,\nLeaning on the everlasting arms;\nO how bright the path grows from day to day,\nLeaning on the everlasting arms.",
    ],
    chorus: "Leaning, leaning, safe and secure from all alarms;\nLeaning, leaning, leaning on the everlasting arms.",
  },
  {
    id: "trust-and-obey",
    title: "Trust and Obey",
    author: "John H. Sammis",
    year: 1887,
    verses: [
      "When we walk with the Lord in the light of His Word,\nWhat a glory He sheds on our way!\nWhile we do His good will, He abides with us still,\nAnd with all who will trust and obey.",
      "Not a burden we bear, not a sorrow we share,\nBut our toil He doth richly repay;\nNot a grief or a loss, not a frown or a cross,\nBut is blest if we trust and obey.",
    ],
    chorus: "Trust and obey, for there's no other way\nTo be happy in Jesus, but to trust and obey.",
  },
  {
    id: "joy-to-the-world",
    title: "Joy to the World",
    author: "Isaac Watts",
    year: 1719,
    verses: [
      "Joy to the world, the Lord is come!\nLet earth receive her King;\nLet every heart prepare Him room,\nAnd heaven and nature sing.",
      "He rules the world with truth and grace,\nAnd makes the nations prove\nThe glories of His righteousness,\nAnd wonders of His love.",
    ],
  },
  {
    id: "silent-night",
    title: "Silent Night",
    author: "Joseph Mohr",
    year: 1818,
    verses: [
      "Silent night, holy night!\nAll is calm, all is bright\nRound yon virgin mother and child.\nHoly infant so tender and mild,\nSleep in heavenly peace,\nSleep in heavenly peace.",
      "Silent night, holy night!\nShepherds quake at the sight;\nGlories stream from heaven afar,\nHeavenly hosts sing Alleluia;\nChrist the Savior is born,\nChrist the Savior is born.",
    ],
  },
  {
    id: "rock-of-ages",
    title: "Rock of Ages",
    author: "Augustus Toplady",
    year: 1763,
    verses: [
      "Rock of Ages, cleft for me,\nLet me hide myself in Thee;\nLet the water and the blood,\nFrom Thy wounded side which flowed,\nBe of sin the double cure,\nSave from wrath and make me pure.",
      "Not the labor of my hands\nCan fulfill Thy law's demands;\nCould my zeal no respite know,\nCould my tears forever flow,\nAll for sin could not atone;\nThou must save, and Thou alone.",
    ],
  },
  {
    id: "all-hail-the-power",
    title: "All Hail the Power of Jesus' Name",
    author: "Edward Perronet",
    year: 1779,
    verses: [
      "All hail the power of Jesus' name!\nLet angels prostrate fall;\nBring forth the royal diadem,\nAnd crown Him Lord of all.",
      "Let every kindred, every tribe,\nOn this terrestrial ball,\nTo Him all majesty ascribe,\nAnd crown Him Lord of all.",
    ],
  },
  {
    id: "standing-on-the-promises",
    title: "Standing on the Promises",
    author: "R. Kelso Carter",
    year: 1886,
    verses: [
      "Standing on the promises of Christ my King,\nThrough eternal ages let His praises ring;\nGlory in the highest, I will shout and sing,\nStanding on the promises of God.",
      "Standing on the promises that cannot fail,\nWhen the howling storms of doubt and fear assail,\nBy the living Word of God I shall prevail,\nStanding on the promises of God.",
    ],
    chorus: "Standing, standing, standing on the promises of God my Savior;\nStanding, standing, I'm standing on the promises of God.",
  },
];

export function searchHymns(query: string): Hymn[] {
  const q = query.trim().toLowerCase();
  if (!q) return hymns;
  return hymns.filter(
    (h) =>
      h.title.toLowerCase().includes(q) ||
      h.author.toLowerCase().includes(q) ||
      h.verses.some((v) => v.toLowerCase().includes(q)) ||
      (h.chorus ?? "").toLowerCase().includes(q)
  );
}
