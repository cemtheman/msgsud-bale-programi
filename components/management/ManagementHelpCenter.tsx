'use client';

type ManagementSection = 'PROGRAM' | 'PLAN' | 'RESOURCES' | 'STATUS';

const SECTION_GUIDES: Record<
  ManagementSection,
  {
    eyebrow: string;
    title: string;
    summary: string;
    steps: string[];
  }
> = {
  PROGRAM: {
    eyebrow: 'Program',
    title: 'Dersleri haftalık çizelgeye yerleştirin',
    summary:
      'Ders Havuzu henüz programa yerleşmemiş dersleri gösterir. Bir kartı uygun saate sürükleyin; sistem sınıf, öğretmen ve salon çakışmalarını sizin için kontrol eder.',
    steps: [
      'Ders Havuzu’nu açın ve yerleştirilecek kartı seçin.',
      'Kartı çizelgede uygun görünen saate sürükleyin.',
      'Birden fazla öğretmen veya salon seçeneği varsa Ayrıntılar panelinden seçim yapın.',
      'Yanlış bir işlem yaptıysanız Geri Al / Yinele ile güvenle geri dönebilirsiniz.',
    ],
  },
  PLAN: {
    eyebrow: 'Ders Planı',
    title: 'Bir dersin yapısını ve kaynak kurallarını tanımlayın',
    summary:
      'Bu bölüm haftalık yerleşimin kendisini değil, dersin kaç bloktan oluşacağını ve hangi öğretmen/salon seçenekleriyle çalışabileceğini tanımlar.',
    steps: [
      'Dersi ve sınıfı bulun.',
      'Blok yapısını, öğretmen tanımını veya salon seçme yöntemini inceleyin.',
      'Programda yerleşmiş bloklar varsa yapısal değişiklikten önce uyarıları dikkate alın.',
      'Tek bir mevcut yerleşimin öğretmenini veya salonunu değiştirmek için Program > Ayrıntılar yolunu kullanın.',
    ],
  },
  RESOURCES: {
    eyebrow: 'Kaynaklar',
    title: 'Öğretmen ve salon kayıtlarını yönetin',
    summary:
      'Öğretmenlerin ve salonların adlarını, kullanılabilirlik durumlarını ve salon özelliklerini buradan yönetirsiniz. Kaynak değişiklikleri uygun yer hesaplarını etkileyebilir.',
    steps: [
      'Öğretmen veya salon listesinden kaynağı seçin.',
      'Ad, aktiflik veya salon özelliği gibi gerekli alanı değiştirin.',
      'Etkisi olan işlemlerde önizlemeyi kontrol edin.',
      'Kullanımda olan kaynakları silmek yerine durumunu yönetmeyi tercih edin.',
    ],
  },
  STATUS: {
    eyebrow: 'Program Durumu',
    title: 'Taslağın yayınlanmaya ne kadar hazır olduğunu görün',
    summary:
      'Eksik yerleşimler, veri sorunları ve yayın öncesi kontroller burada özetlenir. Bu ekran programı düzenlemekten çok kontrol etmek için kullanılır.',
    steps: [
      'Ortaokul / Lise kapsamını seçin.',
      'Eksik veya uyarı üreten başlıkları inceleyin.',
      'Sorunu Program, Ders Planı veya Kaynaklar bölümünde düzeltin.',
      'Yayın adımından önce durum ekranını son kontrol noktası olarak kullanın.',
    ],
  },
};

const GLOSSARY = [
  {
    term: 'Ders Havuzu',
    text: 'Henüz haftalık programa yerleştirilmemiş ders kartlarının bulunduğu alan.',
  },
  {
    term: 'Yerleşim',
    text: 'Bir ders kartının belirli gün ve saatte, öğretmen ve salon bilgisiyle programda bulunması.',
  },
  {
    term: 'Belirsiz',
    text: 'Bir hata anlamına gelmez. Dersin öğretmen veya salon bilgisi henüz kesinleşmemiş olabilir; uygun seçenek varsa ders yine yerleştirilebilir.',
  },
  {
    term: 'Ortak kart',
    text: '5A + 5B gibi birden fazla sınıfı birlikte temsil eden kart. Ekranda tek görünür; işlemler alttaki kayıtlar için birlikte uygulanır.',
  },
  {
    term: 'Geri Al / Yinele',
    text: 'Son program işlemini geri alır veya yeniden uygular. Birleşik ders işlemleri de birlikte korunur.',
  },
];

export function ManagementHelpCenter({
  open,
  activeSection,
  onClose,
}: {
  open: boolean;
  activeSection: ManagementSection;
  onClose: () => void;
}) {
  if (!open) return null;

  const guide = SECTION_GUIDES[activeSection];

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Yönetim yardım merkezi">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Yardımı kapat"
      />

      <aside className="absolute inset-y-0 right-0 flex w-[min(440px,calc(100vw-1rem))] flex-col border-l border-slate-200 bg-[#FCFBF8] shadow-[-24px_0_70px_rgba(15,23,42,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A63D48]">
              Yardım Merkezi
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
              Yönetim nasıl çalışır?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
          >
            Kapat
          </button>
        </div>

        <div className="management-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
              Şu anda · {guide.eyebrow}
            </p>
            <h3 className="mt-1 text-base font-black text-slate-950">
              {guide.title}
            </h3>
            <p className="mt-2 text-[11px] font-medium leading-5 text-slate-600">
              {guide.summary}
            </p>

            <div className="mt-4 space-y-2">
              {guide.steps.map((step, index) => (
                <div key={step} className="flex gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[9px] font-black text-white">
                    {index + 1}
                  </span>
                  <p className="text-[10px] font-semibold leading-5 text-slate-700">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4">
            <p className="px-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Dört ana bölüm
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(Object.keys(SECTION_GUIDES) as ManagementSection[]).map((section) => {
                const item = SECTION_GUIDES[section];
                const active = section === activeSection;
                return (
                  <div
                    key={section}
                    className={`rounded-2xl border p-3 ${
                      active
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <p className={`text-[9px] font-black uppercase tracking-[0.12em] ${
                      active ? 'text-slate-300' : 'text-slate-400'
                    }`}>
                      {item.eyebrow}
                    </p>
                    <p className="mt-1 text-[10px] font-bold leading-4">
                      {item.title}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mt-5">
            <p className="px-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Temel kavramlar
            </p>
            <div className="mt-2 space-y-2">
              {GLOSSARY.map((item) => (
                <div key={item.term} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-black text-slate-900">
                    {item.term}
                  </p>
                  <p className="mt-1 text-[10px] font-medium leading-5 text-slate-600">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5 rounded-[22px] border border-blue-200 bg-blue-50/70 p-4">
            <p className="text-[10px] font-black text-blue-950">
              Ders Planı ile Yerleşim aynı şey değildir
            </p>
            <p className="mt-1 text-[10px] font-medium leading-5 text-blue-800">
              Ders Planı, bir dersin hangi öğretmen ve salon seçenekleriyle çalışabileceğini tanımlar.
              Programdaki “Yerleşimi düzenle” işlemi ise yalnızca seçili mevcut yerleşimin öğretmenini
              veya salonunu değiştirir; Ders Planı havuzunu değiştirmez.
            </p>
          </section>

          <section className="mt-3 rounded-[22px] border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="text-[10px] font-black text-emerald-950">
              Renkleri karar desteği olarak kullanın
            </p>
            <p className="mt-1 text-[10px] font-medium leading-5 text-emerald-800">
              Uygun hedefler yerleştirmeye açıktır. Uygun olmayan bir hedefte sistem sınıf,
              öğretmen veya salon çakışmasının nedenini Ayrıntılar panelinde gösterir.
            </p>
          </section>
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-3">
          <p className="text-[9px] font-semibold leading-4 text-slate-400">
            Yardım metinleri çalışma alanını açıklamak içindir; program verisini değiştirmez.
          </p>
        </div>
      </aside>
    </div>
  );
}
