/* =====================================================================
   Capitula Viewer — configuration
   Edit this file to add editions or to reuse the viewer for other
   capitula series. Everything else is read from the TEI file itself.
   ===================================================================== */
window.CAPITULA_CONFIG = {
  // Name shown in the top bar
  siteTitle: "Capitula Viewer",
  siteSubtitle: "DOBiPS · Digital critical editions of the biblical capitula",
  projectUrl: "https://ai4ch-uniud.github.io/DOBIPS/",

  // Editions offered in the selector.
  //   file:      path of the TEI file (relative to index.html, or a full URL)
  //   imageBase: prefix added to the relative @facs paths of <pb> (leave "" if
  //              images sit next to index.html with the same relative paths)
  editions: [
    { id: "genesis", label: "Genesis", file: "tei/genesis.xml",
      imageBase: "https://ai4ch-uniud.github.io/DOBIPS/Turon_Genesis/" },
    { id: "exodus", label: "Exodus", file: "tei/exodus.xml",
      imageBase: "https://ai4ch-uniud.github.io/DOBIPS/evt_esodo/" },
    { id: "leviticus", label: "Leviticus", file: "tei/leviticus.xml",
      imageBase: "https://ai4ch-uniud.github.io/DOBIPS/Turon_Leviticus/" },
    { id: "deuteronomium", label: "Deuteronomium", file: "tei/deuteronomium.xml",
      imageBase: "https://ai4ch-uniud.github.io/DOBIPS/evt_Deuteronomium/" },
    { id: "iosue", label: "Iosue", file: "tei/iosue.xml",
      imageBase: "https://ai4ch-uniud.github.io/DOBIPS/evt_Iosue/" },
    { id: "iosue_tu", label: "Iosue (Tu)", file: "tei/iosue_tu.xml",
      imageBase: "https://ai4ch-uniud.github.io/DOBIPS/evt_Iosue_Tu/" },
    { id: "iudices", label: "Iudices", file: "tei/iudices.xml",
      imageBase: "https://ai4ch-uniud.github.io/DOBIPS/Turon_Iudices/" },
    { id: "ruth", label: "Ruth", file: "tei/ruth.xml",
      imageBase: "https://ai4ch-uniud.github.io/DOBIPS/evt_Ruth/" }
  ],
  defaultEdition: "exodus",

  // Witness roles. If the TEI contains nested <listWit xml:id="…"> groups,
  // those are used instead of the automatic group below.
  //  - comparanda: witnesses collated for comparison, outside the group
  //  - group: every other manuscript witness (witnesses without <msDesc>,
  //    such as de Bruyne's edition, are treated as printed editions)
  comparanda: ["Am1", "Am2", "Tu"],
  group: { id: "Phi", label: "Φ", name: "Tours Bibles" },

  // Biblical text shown beside each capitulum that has a biblical anchor
  // (<ref type="parallelPassage">): the whole chapter, divided at the anchors
  // of the capitula, with the passage of the current capitulum marked
  // (from its anchor to the verse before the next anchor, in biblical order).
  // Two formats:
  //   "bible-api": a web service answering like https://bible-api.com
  //                ({book} = code from bookCodes, {chapter} = chapter number)
  //   "json":      a local file mapping references to verses, e.g. {"Gn 1:1": "In principio…", …}
  //                with the same book abbreviations as the TEI (useful for the Vetus Latina,
  //                or for a critical Vulgate text you are allowed to republish)
  bibleText: [
    { id: "vulgate", label: "Vulgate (Clementine)", format: "bible-api",
      url: "https://bible-api.com/{book}%20{chapter}?translation=clementine",
      note: "Clementine Vulgate (1592) from bible-api.com: a late text, not the critical Vulgate." }
    // { id: "vl", label: "Vetus Latina", format: "json", url: "bible/vetus-latina.json",
    //   note: "…" }
  ],
  // Standard book codes (as used by bible-api.com) and number of chapters,
  // keyed by the abbreviations found in the TEI references.
  bookCodes: {
    Gn: "GEN", Genesis: "GEN", Ex: "EXO", Exodus: "EXO", Lv: "LEV", Lev: "LEV", Leviticus: "LEV",
    Nm: "NUM", Num: "NUM", Numeri: "NUM", Dt: "DEU", Deuteronomium: "DEU",
    Ios: "JOS", Iosue: "JOS", Idc: "JDG", Iudices: "JDG", Rt: "RUT", Ruth: "RUT"
  },
  bookChapters: { GEN: 50, EXO: 40, LEV: 27, NUM: 36, DEU: 34, JOS: 24, JDG: 21, RUT: 4 },

  // Link for biblical references found in notes and <ref type="parallelPassage">.
  // {ref} is replaced by the reference with the book abbreviation expanded.
  bibleLink: "https://www.biblegateway.com/passage/?search={ref}&version=VULGATE",
  bookNames: {
    Gn: "Genesis", Ex: "Exodus", Lv: "Leviticus", Nm: "Numbers", Dt: "Deuteronomy",
    Ios: "Joshua", Idc: "Judges", Rt: "Ruth", Ps: "Psalms", Ez: "Ezekiel", Lev: "Leviticus", Num: "Numbers",
    Genesis: "Genesis", Exodus: "Exodus", Leviticus: "Leviticus", Numeri: "Numbers", Deuteronomium: "Deuteronomy",
    Iosue: "Joshua", Iudices: "Judges", Ruth: "Ruth"
  }
};
