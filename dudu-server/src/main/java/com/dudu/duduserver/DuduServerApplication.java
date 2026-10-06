package com.dudu.duduserver;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@ConfigurationPropertiesScan
@SpringBootApplication
public class DuduServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(DuduServerApplication.class, args);
    }

}
