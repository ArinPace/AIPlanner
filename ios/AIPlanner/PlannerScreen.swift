import SwiftUI
import SafariServices

@MainActor final class PlannerModel: ObservableObject {
    @Published var darkMode = UserDefaults.standard.bool(forKey: "planner-dark-mode")
    var backgroundColor: UIColor {
        darkMode ? UIColor(red: 23 / 255, green: 25 / 255, blue: 29 / 255, alpha: 1) : .white
    }
    @Published var loading = true
    @Published var error: String?
    @Published var sharedFile: SharedFile?
    @Published var browser: BrowserDestination?
    var reload: (() -> Void)?
    var resume: (() -> Void)?
}
struct SharedFile: Identifiable { let id = UUID(); let url: URL }
struct BrowserDestination: Identifiable { let id = UUID(); let url: URL }

struct PlannerScreen: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model = PlannerModel()
    var body: some View {
        ZStack {
            Color(uiColor: model.backgroundColor).ignoresSafeArea()
            PlannerWebView(model: model)
                .ignoresSafeArea(.container, edges: .bottom)
            if let error = model.error {
                VStack(spacing: 16) {
                    Image(systemName: "wifi.exclamationmark").font(.largeTitle)
                    Text("Couldn’t open Planner").font(.headline)
                    Text(error).font(.subheadline).multilineTextAlignment(.center)
                    Button("Try again") { model.error = nil; model.reload?() }
                        .buttonStyle(.borderedProminent).accessibilityIdentifier("retryPlanner")
                }.padding(28).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18)).padding()
            } else if model.loading {
                ProgressView("Opening Planner…").padding(24)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            }
        }
        .preferredColorScheme(model.darkMode ? .dark : .light)
        .onChange(of: scenePhase) { _, phase in if phase == .active { model.resume?() } }
        .sheet(item: $model.sharedFile) { item in ShareSheet(url: item.url) }
        .sheet(item: $model.browser) { item in SiteBrowser(url: item.url).ignoresSafeArea() }
    }
}
struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
struct SiteBrowser: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
