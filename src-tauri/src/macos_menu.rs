use tauri::{AppHandle, Manager};
use tauri::menu::{AboutMetadata, Menu, PredefinedMenuItem, Submenu};

fn resolve_product_display_name(app: &AppHandle) -> String {
    let config = app.config();
    if let Some(name) = config.product_name.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        return name.to_string();
    }

    app.package_info().name.clone()
}

/// macOS dev builds use the Cargo binary name in the default app menu. Replace it with
/// `productName` from tauri.conf (merged from ui.config.yaml branding).
pub fn install_branded_menu(app: &AppHandle) -> tauri::Result<()> {
    let product_name = resolve_product_display_name(app);
    let pkg_info = app.package_info();
    let config = app.config();

    let about_metadata = AboutMetadata {
        name: Some(product_name.clone()),
        version: Some(pkg_info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config.bundle.publisher.clone().map(|publisher| vec![publisher]),
        ..Default::default()
    };

    let about_label = format!("About {product_name}");
    let hide_label = format!("Hide {product_name}");
    let quit_label = format!("Quit {product_name}");

    let window_menu = Submenu::with_id_and_items(
        app,
        tauri::menu::WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let help_menu = Submenu::with_id_and_items(app, tauri::menu::HELP_SUBMENU_ID, "Help", true, &[])?;

    let menu = Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                product_name,
                true,
                &[
                    &PredefinedMenuItem::about(app, Some(about_label.as_str()), Some(about_metadata))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, Some(hide_label.as_str()))?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, Some(quit_label.as_str()))?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "File",
                true,
                &[&PredefinedMenuItem::close_window(app, None)?],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "View",
                true,
                &[&PredefinedMenuItem::fullscreen(app, None)?],
            )?,
            &window_menu,
            &help_menu,
        ],
    )?;

    app.set_menu(menu)?;
    Ok(())
}
