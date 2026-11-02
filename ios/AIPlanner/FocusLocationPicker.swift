import SwiftUI
import MapKit

struct FocusLocationPicker: View {
    @ObservedObject var location: FocusLocationController
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [MKMapItem] = []
    @State private var search: MKLocalSearch?
    @State private var searching = false
    @State private var error: String?
    @State private var searchID = UUID()
    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("Address or place name", text: $query).accessibilityIdentifier("focusPlaceQuery").textInputAutocapitalization(.words).autocorrectionDisabled()
                            .submitLabel(.search).onSubmit { findPlaces() }
                        Button("Search") { findPlaces() }.accessibilityIdentifier("focusPlaceSearch").disabled(searching || query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    Button(location.locating ? "Finding location…" : "Use current location") {
                        location.useCurrentPlace { place in
                            if let place { location.setPlace(place); dismiss() }
                        }
                    }.disabled(location.locating)
                }
                if searching { ProgressView("Searching places…") }
                if let error { Text(error).foregroundStyle(.red) }
                if let error = location.error { Text(error).foregroundStyle(.red) }
                ForEach(Array(results.enumerated()), id: \.offset) { index, result in
                    Button {
                        let c = result.placemark.coordinate
                        let name = result.name ?? query
                        let address = result.placemark.title ?? ""
                        let label = address.isEmpty || address.localizedCaseInsensitiveContains(name) ? (address.isEmpty ? name : address) : name + " · " + address
                        location.setPlace(FocusPlace(name: label, latitude: c.latitude, longitude: c.longitude, radius: 100))
                        dismiss()
                    } label: {
                        VStack(alignment: .leading) {
                            Text(result.name ?? "Location")
                            if let address = result.placemark.title { Text(address).font(.caption).foregroundStyle(.secondary) }
                        }
                    }.accessibilityIdentifier("focusPlaceResult-\(index)")
                }
            }
            .navigationTitle("Blocking location")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .onDisappear { searchID = UUID(); search?.cancel(); location.cancelCurrentPlaceRequest() }
    }
    private func findPlaces() {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        search?.cancel(); let id = UUID(); searchID = id
        let request = MKLocalSearch.Request(); request.naturalLanguageQuery = text
        let next = MKLocalSearch(request: request); search = next
        searching = true; error = nil; results = []
        Task { @MainActor in
            do {
                let response = try await next.start()
                guard searchID == id else { return }
                results = response.mapItems
                if results.isEmpty { error = "No places found. Try a more complete address." }
            } catch {
                guard searchID == id else { return }
                self.error = "Could not search places. Check your connection and try again."
            }
            if searchID == id { searching = false }
        }
    }
}
