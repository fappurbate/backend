{% extends 'layout.swig' %}

{% block title %}Kothique Chaturbate Backend{% endblock %}

{% block content %}
  <div class="title">Broadcasters</div>

  <ul>
    {% for broadcaster in broadcasters %}
      <li><a href="/{{ broadcaster.username }}">{{ broadcaster.username }}</a></li>
    {% endfor %}
  </ul>
{% endblock %}
