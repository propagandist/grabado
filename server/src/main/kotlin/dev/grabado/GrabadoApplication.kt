package dev.grabado

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.runApplication

@SpringBootApplication
@ConfigurationPropertiesScan
class GrabadoApplication

fun main(args: Array<String>) {
    runApplication<GrabadoApplication>(*args)
}
