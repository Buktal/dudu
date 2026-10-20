package com.dudu.duduserver.channel.console;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ConsoleCallbackUrlsTest {
    @Test
    void meituanRequiresExplicitPublicHttpWithPort80Or8080() {
        assertThat(new ConsoleCallbackUrls("http://public.example").meituanAvailable("http://localhost:1234")).isTrue();
        assertThat(new ConsoleCallbackUrls("http://public.example:8080").meituanAvailable("unused")).isTrue();
        assertThat(new ConsoleCallbackUrls("https://public.example").meituanAvailable("unused")).isFalse();
        assertThat(new ConsoleCallbackUrls("http://public.example:8081").meituanAvailable("unused")).isFalse();
        assertThat(new ConsoleCallbackUrls("").meituanAvailable("http://localhost:8080")).isFalse();
    }

    @Test
    void callbackUsesConfiguredOriginAndRejectsPathCredentialsQueryOrFragment() {
        assertThat(new ConsoleCallbackUrls("https://public.example:8443").callback("http://localhost:8080", 42L))
            .isEqualTo("https://public.example:8443/api/channels/42/callback");
        for (String invalid : new String[]{"https://host/path", "https://user:secret@host", "https://host?x=1", "https://host#fragment", "ftp://host", "https://host/"}) {
            assertThatThrownBy(() -> new ConsoleCallbackUrls(invalid)).isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(new ConsoleCallbackUrls("").callback("http://localhost:8080", 42L))
            .isEqualTo("http://localhost:8080/api/channels/42/callback");
    }
}
