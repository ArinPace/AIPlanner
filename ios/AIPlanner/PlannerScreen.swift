import SwiftUI
import SafariServices

@MainActor final class PlannerModel: ObservableObject {
    @Published var loading = true
    @Published var error: String?
    @Published var sharedFile: SharedFile?
    @Published var browser: BrowserDestination?
    var reload: (() -> Void)?
}
struct SharedFile: Identifiable { let id = UUID(); let url: URL }
struct BrowserDestination: Identifiable { let id = UUID(); let url: URL }

struct PlannerScreen: View {
    @StateObject private var model = PlannerModel()
    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground)
            PlannerWebView(model: model)
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
